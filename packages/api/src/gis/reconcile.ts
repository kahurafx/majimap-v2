import {createHash} from "node:crypto";
import {createId} from "@paralleldrive/cuid2";
import {TRPCError} from "@trpc/server";
import {and, eq, inArray, ne, or} from "drizzle-orm";
import {NODE_PHOTO_RULE, type JunctionSpec, type NodeType} from "@majimap/shared-types";
import {photoCounts} from "../photo-counts";
import {junctionColumns, junctionFromRow} from "./junction";
import type {PgTable} from "drizzle-orm/pg-core";
import {z} from "zod";
import {
    dmaBoundaryValves,
    dmas,
    domainEvents,
    nodes,
    pipes,
    structures,
    subnetworks,
    user,
    type Database,
    type LatLng
} from "@majimap/db";
import {gisRoleProcedure, router} from "../trpc";
import {loadBoundaryValves, writeBoundaryValves} from "./dmas";
import {pathLengthMetres} from "./geo";
import {planMerge, type Conflict, type MergePlan, type Resolutions} from "./reconcile-core";
import {syncAssetRegistry, type VersionedRow, type VersionedTable} from "./versioned";
import {BranchSchema, MAIN_BRANCH, rethrowDbError, toIso} from "./versioning";

type EntityType = "node" | "structure" | "pipe" | "dma";
type AnyRow = VersionedRow & Record<string, unknown>;
type WritePlan = Extract<MergePlan, { kind: "write" }>;

/**
 * One kind of versioned entity, as reconcile sees it. Adding a kind to the
 * network means adding an entry here — the merge, the review token, branch
 * listing and discard all work off this list.
 */
type Kind = {
    entityType: EntityType;
    table: VersionedTable;
    /**
     * Every column that can differ between two versions and so can be merged.
     * Deliberately absent: anything immutable (a node's or structure's `type`, a
     * pipe's end nodes) and anything derived (see `finalize`).
     */
    fields: readonly string[];
    displayName: (row: AnyRow) => string;
    /** What of this kind the shared asset registry mirrors once a change lands on main. */
    registry: "name-and-location" | "name" | "none";
    /**
     * Fields that are SETS held in child rows rather than columns (a DMA's boundary
     * valves). They merge by set algebra and never conflict, and being virtual they're
     * kept out of the row insert and written by `saveChildren` instead.
     */
    setFields?: readonly string[];
    /** Load child rows onto every version that was loaded, as the virtual set fields. */
    attachChildren?: (db: Database, rows: AnyRow[]) => Promise<void>;
    /** Write the child rows belonging to a newly inserted main version. */
    saveChildren?: (tx: Database, next: AnyRow, values: Record<string, unknown>) => Promise<void>;
    /**
     * Recompute derived columns from the merged values. A pipe's length is a
     * function of its path, so it's never merged on its own: merging both
     * would split one re-route into two conflicts, and resolving them in
     * opposite directions would leave a length that doesn't match the geometry.
     */
    finalize?: (values: Record<string, unknown>) => Record<string, unknown>;
    /**
     * Fields that exist only on the loaded rows (a node's `junction` is three columns
     * presented as one value). They're merged as a unit, and `finalize` turns them back
     * into columns. They're never written as keys of their own.
     */
    virtualFields?: readonly string[];
};

/**
 * ORDER MATTERS: this is the order writes are applied in. A node housed in a
 * structure created on the same branch has to land after that structure (the
 * attachment trigger looks for the structure on main, and the branch's own
 * rows are retired before any write), and a pipe or a DMA after the nodes it
 * connects or uses.
 */
const KINDS: readonly Kind[] = [
    {
        entityType: "structure",
        table: structures,
        fields: ["name", "location", "condition", "installedAt", "lastInspectedAt"],
        displayName: (row) => String(row.name),
        registry: "name-and-location",
    },
    {
        entityType: "node",
        table: nodes,
        // Junction type and sizes merge as ONE field: sizes are only valid together
        // (the branch must be smaller than the main), so a half-merge could break the CHECK.
        fields: ["name", "location", "condition", "isOpen", "structureId", "installedAt", "lastInspectedAt", "junction"],
        virtualFields: ["junction"],
        displayName: (row) => String(row.name),
        registry: "name-and-location",
        attachChildren: async (_db, rows) => {
            for (const row of rows) row.junction = junctionFromRow(row as never);
        },
        finalize: (values) => {
            const {junction, ...rest} = values;
            return {...rest, ...junctionColumns(junction as JunctionSpec | null | undefined)};
        },
    },
    {
        entityType: "pipe",
        table: pipes,
        fields: ["path", "material", "diameterMm", "condition"],
        displayName: (row) => `Pipe ${row.id}`,
        registry: "none",
        finalize: (values) => ({...values, lengthM: pathLengthMetres(values.path as LatLng[])}),
    },
    {
        entityType: "dma",
        table: dmas,
        fields: ["name", "color", "tierId", "inletMeterId", "boundary", "boundaryValveIds"],
        setFields: ["boundaryValveIds"],
        displayName: (row) => String(row.name),
        registry: "name",
        attachChildren: async (db, rows) => {
            const valves = await loadBoundaryValves(db, rows.map((row) => row.versionId));
            for (const row of rows) row.boundaryValveIds = valves.get(row.versionId) ?? [];
        },
        saveChildren: async (tx, next, values) => {
            await writeBoundaryValves(tx, next.versionId, (values.boundaryValveIds as string[] | undefined) ?? []);
        },
    },
];

const READ_ROLES = ["admin", "gis_engineer", "field_technician"] as const;
const POST_ROLES = ["admin", "gis_engineer"] as const;

type Entry = {
    kind: Kind;
    branchHead: AnyRow;
    /** The version the branch forked from; null if the entity was created on the branch. */
    base: AnyRow | null;
    mainHead: AnyRow | null;
};

type Violation = {
    code:
        | "pipe-endpoint-missing"
        | "node-structure-missing"
        | "dma-inlet-missing"
        | "dma-valve-missing"
        | "subnetwork-controller-missing"
        | "node-photo-missing";
    /** The entity that would be left pointing at something that isn't there. */
    entityId: string;
    /** What it points at. */
    relatedId: string;
    message: string;
};

/** Thrown inside the post transaction to roll everything back, then turned into a normal result. */
class IntegrityFailure extends Error {
    constructor(readonly violations: Violation[]) {
        super("Posting this branch would leave main inconsistent");
    }
}

const tableRef = (kind: Kind) => kind.table as PgTable;

/** A branch's chain walks back through its own versions until it leaves the branch — that's the fork point. */
function findBase(head: AnyRow, byVersion: Map<string, AnyRow>): AnyRow | null {
    let current = head;
    const seen = new Set<string>();
    while (current.branch === head.branch) {
        if (!current.supersedesVersionId) return null;
        if (seen.has(current.versionId)) throw new Error("Cycle in version chain");
        seen.add(current.versionId);
        const previous = byVersion.get(current.supersedesVersionId);
        if (!previous) throw new Error("Broken version chain");
        current = previous;
    }
    return current;
}

/** The versions a head's own branch contributed, newest first. */
function branchChain(head: AnyRow, byVersion: Map<string, AnyRow>): AnyRow[] {
    const chain: AnyRow[] = [];
    const seen = new Set<string>();
    let current: AnyRow | undefined = head;
    while (current && current.branch === head.branch && !seen.has(current.versionId)) {
        seen.add(current.versionId);
        chain.push(current);
        current = current.supersedesVersionId ? byVersion.get(current.supersedesVersionId) : undefined;
    }
    return chain;
}

async function loadEntries(db: Database, orgId: string, branch: string): Promise<Entry[]> {
    const entries: Entry[] = [];
    for (const kind of KINDS) {
        const table = kind.table;
        const branchHeads = (await db
            .select()
            .from(tableRef(kind))
            .where(and(eq(table.organizationId, orgId), eq(table.branch, branch), eq(table.isHead, true)))) as unknown as AnyRow[];
        if (branchHeads.length === 0) continue;

        const allVersions = (await db
            .select()
            .from(tableRef(kind))
            .where(
                and(eq(table.organizationId, orgId), inArray(table.id, branchHeads.map((h) => h.id))),
            )) as unknown as AnyRow[];
        await kind.attachChildren?.(db, allVersions);

        const byEntity = new Map<string, AnyRow[]>();
        for (const row of allVersions) byEntity.set(row.id, [...(byEntity.get(row.id) ?? []), row]);

        for (const branchHead of branchHeads) {
            const versions = byEntity.get(branchHead.id) ?? [];
            const byVersion = new Map(versions.map((v) => [v.versionId, v]));
            entries.push({
                kind,
                // The copy from `allVersions`, which has any child rows attached.
                branchHead: byVersion.get(branchHead.versionId) ?? branchHead,
                base: findBase(branchHead, byVersion),
                mainHead: versions.find((v) => v.branch === MAIN_BRANCH && v.isHead) ?? null,
            });
        }
    }
    return entries;
}

/**
 * A fingerprint of exactly which branch versions were reviewed, across every
 * kind of entity. Approving with a stale one is refused, so "approve" always
 * means "approve what I was shown".
 */
function headsToken(entries: readonly Entry[]): string {
    return createHash("sha256")
        .update(entries.map((e) => `${e.branchHead.id}:${e.branchHead.versionId}`).sort().join("|"))
        .digest("hex")
        .slice(0, 32);
}

function planFor(entry: Entry, resolutions: Resolutions = {}): MergePlan {
    return planMerge({
        base: entry.base,
        branch: entry.branchHead,
        main: entry.mainHead
    }, entry.kind.fields, resolutions, {
        setFields: entry.kind.setFields,
    });
}

const toWire = (value: unknown) => (value instanceof Date ? value.toISOString() : value);
const wireConflict = (c: Conflict): Conflict => ({
    field: c.field,
    base: toWire(c.base),
    branch: toWire(c.branch),
    main: toWire(c.main),
});

function entityName(entry: Entry): string {
    const shown = entry.branchHead.isDeleted ? (entry.mainHead ?? entry.branchHead) : entry.branchHead;
    return entry.kind.displayName(shown);
}

/** What changes, field by field: the live value now, and what it becomes. */
function changesOf(entry: Entry, plan: WritePlan) {
    if (plan.tombstone) return [];
    const live = entry.mainHead && !entry.mainHead.isDeleted ? entry.mainHead : null;
    return plan.changedFields.map((field) => ({ field, from: toWire(live ? live[field] : null), to: toWire(plan.values[field]) }));
}

function describePlan(entry: Entry, plan: MergePlan) {
    return {
        kind: plan.kind,
        detail: plan.kind === "write" ? plan.mode : plan.kind === "skip" ? plan.reason : "conflict",
        changedFields: plan.kind === "write" ? plan.changedFields : [],
        changes: plan.kind === "write" ? changesOf(entry, plan) : [],
        conflicts: plan.kind === "conflict" ? plan.conflicts.map(wireConflict) : [],
    };
}

const needsPhotoEvidence = (entry: Entry, plan: MergePlan) =>
    entry.kind.entityType === "node" &&
    plan.kind === "write" &&
    plan.mode === "create" &&
    NODE_PHOTO_RULE[entry.branchHead.type as NodeType] === "required";

function assertNotMain(branch: string) {
    if (branch === MAIN_BRANCH) {
        throw new TRPCError({code: "BAD_REQUEST", message: "Main can't be reconciled onto itself"});
    }
}

async function retireHead(tx: Database, kind: Kind, versionId: string) {
    const table = kind.table;
    const flipped = await tx
        .update(table)
        .set({isHead: false} as never)
        .where(and(eq(table.versionId, versionId), eq(table.isHead, true)))
        .returning({versionId: table.versionId});
    if (flipped.length === 0) {
        throw new TRPCError({
            code: "CONFLICT",
            message: "The branch changed while it was being reconciled — review it again"
        });
    }
}

type Applied = { entityType: EntityType; id: string; tombstone: boolean; next: AnyRow; mode: WritePlan["mode"] };

async function applyWrite(
    tx: Database,
    args: { orgId: string; userId: string; branch: string; entry: Entry; plan: WritePlan },
): Promise<Applied> {
    const {orgId, userId, branch, entry, plan} = args;
    const {kind, mainHead, branchHead} = entry;
    const table = kind.table;

    if (mainHead) {
        // Compare-and-set: if main moved since we read it, this matches nothing and the
        // whole reconcile rolls back rather than overwriting someone's edit.
        const flipped = await tx
            .update(table)
            .set({isHead: false} as never)
            .where(and(eq(table.versionId, mainHead.versionId), eq(table.isHead, true)))
            .returning({versionId: table.versionId});
        if (flipped.length === 0) {
            throw new TRPCError({code: "CONFLICT", message: "Main changed while reconciling — review again and retry"});
        }
    }

    const source = mainHead ?? branchHead;
    const {versionId: _versionId, createdAt: _createdAt, ...carried} = source;
    const values = plan.tombstone ? {} : kind.finalize ? kind.finalize(plan.values) : plan.values;
    const virtual = new Set([...(kind.setFields ?? []), ...(kind.virtualFields ?? [])]);
    const columnsOnly = (record: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(record).filter(([key]) => !virtual.has(key)));

    const [next] = (await tx
        .insert(table)
        .values({
            ...columnsOnly(carried),
            ...columnsOnly(values),
            versionId: createId(),
            branch: MAIN_BRANCH,
            isHead: true,
            isDeleted: plan.tombstone,
            supersedesVersionId: mainHead?.versionId ?? branchHead.versionId,
            createdByUserId: userId,
        } as never)
        .returning()) as unknown as AnyRow[];
    if (!next) throw new Error("Insert returned no row");
    if (!plan.tombstone) await kind.saveChildren?.(tx, next, values);

    if (!plan.tombstone && kind.registry !== "none") {
        // Now that the change is real, the shared registry can learn about it.
        await syncAssetRegistry(
            tx,
            next.id,
            kind.registry === "name"
                ? {label: String(next.name)}
                : {label: String(next.name), location: next.location as LatLng},
        );
    }

    // A condition change is only a fact other modules should react to once it lands on main.
    if (mainHead && !mainHead.isDeleted && !plan.tombstone && plan.changedFields.includes("condition")) {
        await tx.insert(domainEvents).values({
            organizationId: orgId,
            type: "asset.condition_changed",
            sourceModule: "gis",
            payload: {
                assetId: next.id,
                from: mainHead.condition,
                to: next.condition,
                changedByUserId: userId,
                reconciledFromBranch: branch,
            },
        });
    }

    return { entityType: kind.entityType, id: next.id, tombstone: plan.tombstone, next, mode: plan.mode };
}

/**
 * Each entity can merge cleanly on its own and main can still end up
 * inconsistent: the guards that stop you deleting a node with pipes on it, or
 * a structure with nodes in it, only see the branch as it was at the time, and
 * main may have moved since. So after the writes, look at what they touched
 * and what depends on it — on main — and report anything left pointing at
 * something that isn't there.
 */
async function findViolations(tx: Database, orgId: string, applied: readonly Applied[]): Promise<Violation[]> {
    const violations: Violation[] = [];
    const mainLive = <T extends VersionedTable>(table: T) =>
        and(eq(table.organizationId, orgId), eq(table.branch, MAIN_BRANCH), eq(table.isHead, true), eq(table.isDeleted, false));

    const deletedNodes = applied.filter((a) => a.entityType === "node" && a.tombstone).map((a) => a.id);
    const deletedStructures = applied.filter((a) => a.entityType === "structure" && a.tombstone).map((a) => a.id);
    const writtenPipes = applied.filter((a) => a.entityType === "pipe" && !a.tombstone).map((a) => a.id);
    const housedNodes = applied
        .filter((a) => a.entityType === "node" && !a.tombstone && a.next.structureId)
        .map((a) => a.id);

    // Pipes: ones just written, plus any live pipe on main that ended on a node just deleted.
    const pipeIds = new Set(writtenPipes);
    if (deletedNodes.length > 0) {
        const attached = await tx
            .select({id: pipes.id})
            .from(pipes)
            .where(and(mainLive(pipes), or(inArray(pipes.fromNodeId, deletedNodes), inArray(pipes.toNodeId, deletedNodes))));
        for (const row of attached) pipeIds.add(row.id);
    }
    if (pipeIds.size > 0) {
        const pipeRows = await tx
            .select({id: pipes.id, fromNodeId: pipes.fromNodeId, toNodeId: pipes.toNodeId})
            .from(pipes)
            .where(and(mainLive(pipes), inArray(pipes.id, [...pipeIds])));
        const endpointIds = [...new Set(pipeRows.flatMap((p) => [p.fromNodeId, p.toNodeId]))];
        const liveEndpoints = new Set(
            (
                await tx
                    .select({id: nodes.id})
                    .from(nodes)
                    .where(and(mainLive(nodes), inArray(nodes.id, endpointIds)))
            ).map((row) => row.id),
        );
        for (const pipe of pipeRows) {
            for (const endId of [pipe.fromNodeId, pipe.toNodeId]) {
                if (!liveEndpoints.has(endId)) {
                    violations.push({
                        code: "pipe-endpoint-missing",
                        entityId: pipe.id,
                        relatedId: endId,
                        message: `Pipe ${pipe.id} would end on node ${endId}, which doesn't exist on main`,
                    });
                }
            }
        }
    }

    // Nodes: ones just written with a structure, plus any live node on main housed in one just deleted.
    const nodeIds = new Set(housedNodes);
    if (deletedStructures.length > 0) {
        const housed = await tx
            .select({id: nodes.id})
            .from(nodes)
            .where(and(mainLive(nodes), inArray(nodes.structureId, deletedStructures)));
        for (const row of housed) nodeIds.add(row.id);
    }
    if (nodeIds.size > 0) {
        const nodeRows = await tx
            .select({id: nodes.id, structureId: nodes.structureId})
            .from(nodes)
            .where(and(mainLive(nodes), inArray(nodes.id, [...nodeIds])));
        const structureIds = [...new Set(nodeRows.flatMap((n) => (n.structureId ? [n.structureId] : [])))];
        const liveStructures = new Set(
            structureIds.length === 0
                ? []
                : (
                    await tx
                        .select({id: structures.id})
                        .from(structures)
                        .where(and(mainLive(structures), inArray(structures.id, structureIds)))
                ).map((row) => row.id),
        );
        for (const node of nodeRows) {
            if (node.structureId && !liveStructures.has(node.structureId)) {
                violations.push({
                    code: "node-structure-missing",
                    entityId: node.id,
                    relatedId: node.structureId,
                    message: `Node ${node.id} would be housed in structure ${node.structureId}, which doesn't exist on main`,
                });
            }
        }
    }

    // DMAs: ones just written, plus any live DMA on main that used a node just deleted.
    const dmaIds = new Set(applied.filter((a) => a.entityType === "dma" && !a.tombstone).map((a) => a.id));
    if (deletedNodes.length > 0) {
        const byInlet = await tx
            .select({id: dmas.id})
            .from(dmas)
            .where(and(mainLive(dmas), inArray(dmas.inletMeterId, deletedNodes)));
        const byValve = await tx
            .select({id: dmas.id})
            .from(dmas)
            .innerJoin(dmaBoundaryValves, eq(dmaBoundaryValves.dmaVersionId, dmas.versionId))
            .where(and(mainLive(dmas), inArray(dmaBoundaryValves.valveAssetId, deletedNodes)));
        for (const row of [...byInlet, ...byValve]) dmaIds.add(row.id);
    }
    if (dmaIds.size > 0) {
        const dmaRows = await tx
            .select({id: dmas.id, versionId: dmas.versionId, inletMeterId: dmas.inletMeterId})
            .from(dmas)
            .where(and(mainLive(dmas), inArray(dmas.id, [...dmaIds])));
        const valvesByVersion = await loadBoundaryValves(tx, dmaRows.map((d) => d.versionId));
        const referenced = [
            ...new Set(dmaRows.flatMap((d) => [d.inletMeterId, ...(valvesByVersion.get(d.versionId) ?? [])])),
        ];
        const liveTypes = new Map(
            (
                await tx
                    .select({id: nodes.id, type: nodes.type})
                    .from(nodes)
                    .where(and(mainLive(nodes), inArray(nodes.id, referenced)))
            ).map((row): [string, string] => [row.id, row.type]),
        );
        for (const dma of dmaRows) {
            if (liveTypes.get(dma.inletMeterId) !== "meter") {
                violations.push({
                    code: "dma-inlet-missing",
                    entityId: dma.id,
                    relatedId: dma.inletMeterId,
                    message: `DMA ${dma.id} would have inlet meter ${dma.inletMeterId}, which doesn't exist on main`,
                });
            }
            for (const valveId of valvesByVersion.get(dma.versionId) ?? []) {
                if (liveTypes.get(valveId) !== "valve") {
                    violations.push({
                        code: "dma-valve-missing",
                        entityId: dma.id,
                        relatedId: valveId,
                        message: `DMA ${dma.id} would have boundary valve ${valveId}, which doesn't exist on main`,
                    });
                }
            }
        }
    }

    // Subnetworks live on main only, so one whose controller was just deleted is left pointing at nothing.
    if (deletedNodes.length > 0) {
        const orphaned = await tx
            .select({id: subnetworks.id, controllerNodeId: subnetworks.controllerNodeId})
            .from(subnetworks)
            .where(and(eq(subnetworks.organizationId, orgId), inArray(subnetworks.controllerNodeId, deletedNodes)));
        for (const subnetwork of orphaned) {
            violations.push({
                code: "subnetwork-controller-missing",
                entityId: subnetwork.id,
                relatedId: subnetwork.controllerNodeId,
                message: `Subnetwork ${subnetwork.id} would lose its controller ${subnetwork.controllerNodeId}, which is being deleted`,
            });
        }
    }

    // New nodes of a type that needs photo evidence can't go live without at least one uploaded photo.
    const needPhoto = applied.filter(
        (a) => a.entityType === "node" && a.mode === "create" && !a.tombstone && NODE_PHOTO_RULE[a.next.type as NodeType] === "required",
    );
    if (needPhoto.length > 0) {
        const have = await photoCounts(tx, orgId, "node", needPhoto.map((a) => a.id));
        for (const a of needPhoto) {
            if ((have.get(a.id) ?? 0) === 0) {
                violations.push({
                    code: "node-photo-missing",
                    entityId: a.id,
                    relatedId: a.id,
                    message: `${String(a.next.name)} needs at least one photo before it can go live`,
                });
            }
        }
    }

    return violations;
}

export const reconcileRouter = router({
    /**
     * Every open branch in the organization — what the pending-changes screen
     * lists. `changes` counts entities (of any kind) that have a head on the
     * branch. "Who edited it" and "when" cover each head's whole chain of
     * versions back to the fork point, not just the surviving heads, and
     * walking chains (rather than aggregating every row on the branch) keeps a
     * reused branch name from inheriting an earlier, already-posted round.
     */
    branches: gisRoleProcedure(...READ_ROLES).query(async ({ctx}) => {
        const byBranch = new Map<string, { changes: number; versions: Map<string, AnyRow> }>();

        for (const kind of KINDS) {
            const table = kind.table;
            const heads = (await ctx.db
                .select()
                .from(tableRef(kind))
                .where(
                    and(eq(table.organizationId, ctx.organizationId), eq(table.isHead, true), ne(table.branch, MAIN_BRANCH)),
                )) as unknown as AnyRow[];
            if (heads.length === 0) continue;

            const openBranches = [...new Set(heads.map((h) => h.branch))];
            const onOpenBranches = (await ctx.db
                .select()
                .from(tableRef(kind))
                .where(
                    and(eq(table.organizationId, ctx.organizationId), inArray(table.branch, openBranches)),
                )) as unknown as AnyRow[];
            const byVersion = new Map(onOpenBranches.map((row) => [row.versionId, row]));

            for (const head of heads) {
                const summary = byBranch.get(head.branch) ?? {changes: 0, versions: new Map<string, AnyRow>()};
                summary.changes++;
                for (const version of branchChain(head, byVersion)) summary.versions.set(version.versionId, version);
                byBranch.set(head.branch, summary);
            }
        }

        const summaries = [...byBranch.entries()].map(([branch, {changes, versions}]) => {
            const rows = [...versions.values()];
            const times = rows.map((v) => v.createdAt.getTime());
            return {
                branch,
                changes,
                firstEditAt: toIso(new Date(Math.min(...times))),
                lastEditAt: toIso(new Date(Math.max(...times))),
                authorIds: [...new Set(rows.map((v) => v.createdByUserId))],
            };
        });

        const authorIds = [...new Set(summaries.flatMap((s) => s.authorIds))];
        const people = authorIds.length ? await ctx.db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, authorIds)) : [];
        const nameOf = new Map(people.map((p) => [p.id, p.name]));
        return summaries
            .map((s) => ({ ...s, authors: s.authorIds.map((id) => ({ id, name: nameOf.get(id) ?? "Unknown" })) }))
            .sort((a, b) => (b.lastEditAt ?? "").localeCompare(a.lastEditAt ?? ""));
    }),

    /**
     * What posting this branch would do, entity by entity, without doing it.
     * Doesn't check what the result would do to references (see `post`) — that
     * needs the writes applied, and a read shouldn't take locks on main.
     */
    preview: gisRoleProcedure(...READ_ROLES)
        .input(z.object({branch: BranchSchema}))
        .query(async ({ctx, input}) => {
            assertNotMain(input.branch);
            const entries = await loadEntries(ctx.db, ctx.organizationId, input.branch);
            if (entries.length === 0) {
                throw new TRPCError({code: "NOT_FOUND", message: "Nothing to reconcile on that branch"});
            }

            const plans = entries.map((entry) => ({ entry, plan: planFor(entry) }));
            const photoIds = plans.filter(({ entry, plan }) => needsPhotoEvidence(entry, plan)).map(({ entry }) => entry.branchHead.id);
            const have = await photoCounts(ctx.db, ctx.organizationId, "node", photoIds);
            const entities = plans.map(({ entry, plan }) => ({
                id: entry.branchHead.id,
                entityType: entry.kind.entityType,
                name: entityName(entry),
                ...describePlan(entry, plan),
                /** A required photo hasn't been uploaded yet: posting would be refused. */
                needsPhoto: photoIds.includes(entry.branchHead.id) && (have.get(entry.branchHead.id) ?? 0) === 0,
            }));
            return {
                branch: input.branch,
                token: headsToken(entries),
                entities,
                summary: {
                    writes: entities.filter((e) => e.kind === "write").length,
                    skipped: entities.filter((e) => e.kind === "skip").length,
                    conflicts: entities.filter((e) => e.kind === "conflict").length,
                    needPhoto: entities.filter((e) => e.needsPhoto).length,
                },
            };

        }),

    /**
     * Post a branch onto main — all of it or none of it, across every kind of
     * entity. Anything unresolved is reported back and nothing is written.
     * Otherwise every change lands in one transaction, references are checked
     * on main, and only if they hold is the branch retired (its rows stay as
     * history). If they don't, nothing is written and the problems come back
     * as `status: "invalid"`.
     */
    post: gisRoleProcedure(...POST_ROLES)
        .input(
            z.object({
                branch: BranchSchema,
                token: z.string().min(1),
                /** entity id → field → which side wins */
                resolutions: z.record(z.string(), z.record(z.string(), z.enum(["branch", "main"]))).optional(),
            }),
        )
        .mutation(async ({ctx, input}) => {
            assertNotMain(input.branch);
            try {
                return await ctx.db.transaction(async (tx) => {
                    const entries = await loadEntries(tx, ctx.organizationId, input.branch);
                    if (entries.length === 0) {
                        throw new TRPCError({code: "NOT_FOUND", message: "Nothing to reconcile on that branch"});
                    }
                    if (headsToken(entries) !== input.token) {
                        throw new TRPCError({
                            code: "CONFLICT",
                            message: "The branch changed since you reviewed it — review it again",
                        });
                    }

                    const plans = entries.map((entry) => ({
                        entry,
                        plan: planFor(entry, input.resolutions?.[entry.branchHead.id]),
                    }));

                    const unresolved = plans.filter((p) => p.plan.kind === "conflict");
                    if (unresolved.length > 0) {
                        return {
                            status: "conflicts" as const,
                            conflicts: unresolved.map(({entry, plan}) => ({
                                id: entry.branchHead.id,
                                entityType: entry.kind.entityType,
                                name: entityName(entry),
                                conflicts: plan.kind === "conflict" ? plan.conflicts.map(wireConflict) : [],
                            })),
                        };
                    }

                    // Retire the branch first: if two people post the same branch at once, only
                    // one gets to flip these heads and the other fails here.
                    for (const {entry} of plans) await retireHead(tx, entry.kind, entry.branchHead.versionId);

                    const summary = {created: 0, fastForwarded: 0, merged: 0, deleted: 0, restored: 0, skipped: 0};
                    const applied: Applied[] = [];
                    for (const kind of KINDS) {
                        for (const {entry, plan} of plans) {
                            if (entry.kind !== kind) continue;
                            if (plan.kind !== "write") {
                                summary.skipped++;
                                continue;
                            }
                            applied.push(
                                await applyWrite(tx, {
                                    orgId: ctx.organizationId,
                                    userId: ctx.session.userId,
                                    branch: input.branch,
                                    entry,
                                    plan,
                                }),
                            );
                            if (plan.mode === "create") summary.created++;
                            else if (plan.mode === "fast-forward") summary.fastForwarded++;
                            else if (plan.mode === "merge") summary.merged++;
                            else if (plan.mode === "delete") summary.deleted++;
                            else summary.restored++;
                        }
                    }

                    const violations = await findViolations(tx, ctx.organizationId, applied);
                    if (violations.length > 0) throw new IntegrityFailure(violations);

                    return {status: "posted" as const, summary};
                });
            } catch (err) {
                if (err instanceof IntegrityFailure) return {status: "invalid" as const, violations: err.violations};
                rethrowDbError(err);
            }
        }),

    /** Abandon a branch. Its rows stay as history; it just stops being anyone's view of the network. */
    discard: gisRoleProcedure(...POST_ROLES)
        .input(z.object({branch: BranchSchema}))
        .mutation(async ({ctx, input}) => {
            assertNotMain(input.branch);
            const discarded = await ctx.db.transaction(async (tx) => {
                let total = 0;
                for (const kind of KINDS) {
                    const table = kind.table;
                    const flipped = await tx
                        .update(table)
                        .set({isHead: false} as never)
                        .where(
                            and(
                                eq(table.organizationId, ctx.organizationId),
                                eq(table.branch, input.branch),
                                eq(table.isHead, true),
                            ),
                        )
                        .returning({versionId: table.versionId});
                    total += flipped.length;
                }
                return total;
            });
            if (discarded === 0) {
                throw new TRPCError({code: "NOT_FOUND", message: "Nothing to discard on that branch"});
            }
            return {discarded};
        }),
});