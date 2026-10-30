import {TRPCError} from "@trpc/server";
import {createId} from "@paralleldrive/cuid2";
import {and, desc, eq, inArray, sql} from "drizzle-orm";
import {z} from "zod";
import {assets, domainEvents, nodes, structures, type Database} from "@majimap/db";
import {
    ConditionSchema,
    NodeTypeSchema,
    STRUCTURE_ATTACHMENT_RULES,
    type NetworkNode,
    type NodeType, JunctionSchema,
} from "@majimap/shared-types";
import { gisProcedure, gisRoleProcedure, router } from "../trpc";
import { assertNodeHasNoPipes } from "./pipes";
import { assertNodeNotUsedByDma } from "./dmas";
import { assertNodeNotController } from "./subnetworks";
import { junctionColumns, junctionFromRow } from "./junction";
import {
    BranchSchema,
    EntityIdSchema,
    GeoPointInput,
    MAIN_BRANCH,
    compact,
    fromIso,
    rethrowDbError,
    toIso,
} from "./versioning";

type NodeRow = typeof nodes.$inferSelect;
type NodeInsert = typeof nodes.$inferInsert;

/** The shared-types shape the frontends already consume, plus which version/branch this is. */
export type NodeDto = NetworkNode & { versionId: string; branch: string };

export function toNodeDto(row: NodeRow): NodeDto {
    return {
        id: row.id,
        versionId: row.versionId,
        branch: row.branch,
        type: row.type,
        name: row.name,
        location: row.location,
        condition: row.condition,
        isOpen: row.isOpen,
        structureId: row.structureId,
        installedAt: toIso(row.installedAt),
        lastInspectedAt: toIso(row.lastInspectedAt),
        junction: junctionFromRow(row),
    };
}

const WRITE_ROLES = ["admin", "gis_engineer", "field_technician"] as const;
const DELETE_ROLES = ["admin", "gis_engineer"] as const;

const NodePatchSchema = z
    .object({
        name: z.string().trim().min(1).max(200),
        location: GeoPointInput,
        condition: ConditionSchema,
        isOpen: z.boolean().nullable(),
        structureId: EntityIdSchema.nullable(),
        installedAt: z.string().datetime().nullable(),
        lastInspectedAt: z.string().datetime().nullable(),
        junction: JunctionSchema.nullable(),
    })
    .partial()
    .refine((patch) => Object.values(patch).some((v) => v !== undefined), "Patch is empty");

/**
 * A branch's view of the network is main with that branch's own edits laid
 * over it: for each entity, the branch's head if it has one, otherwise
 * main's. Tombstones are filtered AFTER this overlay, so a branch can hide
 * something that still exists on main.
 */
async function loadEffective(
    db: Database,
    orgId: string,
    id: string,
    branch: string
): Promise<NodeRow | undefined> {
    const [row] = await db
        .select()
        .from(nodes)
        .where(
            and(
                eq(nodes.organizationId, orgId),
                eq(nodes.id, id),
                eq(nodes.isHead, true),
                inArray(nodes.branch, [MAIN_BRANCH, branch]),
            ),
        )
        .orderBy(sql`(${nodes.branch} = ${branch})
                     desc`)
        .limit(1);
    return row;
}

async function assertStructureAllows(
    db: Database,
    orgId: string,
    branch: string,
    nodeType: NodeType,
    structureId: string,
) {

    const [structure] = await db
        .select({type: structures.type})
        .from(structures)
        .where(
            and(
                eq(structures.organizationId, orgId),
                eq(structures.id, structureId),
                eq(structures.isHead, true),
                eq(structures.isDeleted, false),
                inArray(structures.branch, [MAIN_BRANCH, branch]),
            ),
        )
        .limit(1);
    if (!structure) {
        throw new TRPCError({code: "BAD_REQUEST", message: "That structure doesn't exist in this organization"});
    }
    if (!STRUCTURE_ATTACHMENT_RULES[nodeType].includes(structure.type)) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: `A ${nodeType.replace("_", " ")} can't be housed in a ${structure.type}`,
        });
    }
}

type EditArgs = {
    orgId: string;
    userId: string;
    id: string;
    branch: string;
    baseVersionId: string;
    patch: Partial<NodeInsert>;
    tombstone: boolean;
};

/**
 * The versioned write. Never updates a row's data in place — it supersedes it.
 *
 * - Branch already has a head for this entity: the edit must be based on
 *   that head (otherwise it's stale — someone else edited this branch). The
 *   head is flipped with a compare-and-set UPDATE, so of two racing edits
 *   exactly one flips it and the other sees zero rows and gets CONFLICT.
 * - Branch has no head yet (first edit on a feature branch): the new row is
 *   built from `baseVersionId` — the version the client actually edited —
 *   NOT from main's current head, and main's row is left untouched. Keeping
 *   branch = base + exactly-the-client's-changes is what lets reconcile
 *   later tell the branch's changes apart from main's concurrent ones.
 */
async function editNode(db: Database, args: EditArgs): Promise<{ previous: NodeRow; next: NodeRow }> {
    const {orgId, userId, id, branch, baseVersionId, patch, tombstone} = args;

    const [branchHead] = await db
        .select()
        .from(nodes)
        .where(and(eq(nodes.organizationId, orgId), eq(nodes.id, id), eq(nodes.branch, branch), eq(nodes.isHead, true)))
        .limit(1);

    let previous: NodeRow;

    if (branchHead) {
        if (branchHead.isDeleted) throw new TRPCError({code: "NOT_FOUND", message: "Node not found"});
        if (branchHead.versionId !== baseVersionId) {
            throw new TRPCError({
                code: "CONFLICT",
                message: "This node changed since you loaded it — refetch and reapply your edit",
            });
        }
        const flipped = await db
            .update(nodes)
            .set({isHead: false})
            .where(and(eq(nodes.versionId, branchHead.versionId), eq(nodes.isHead, true)))
            .returning({versionId: nodes.versionId});
        if (flipped.length === 0) {
            throw new TRPCError({code: "CONFLICT", message: "This node was changed concurrently — refetch and retry"});
        }
        previous = branchHead;
    } else if (branch === MAIN_BRANCH) {
        // No head on main. Either it never existed, or a concurrent edit just superseded
        // the head we expected — those need different answers.
        const [anyVersion] = await db
            .select({versionId: nodes.versionId})
            .from(nodes)
            .where(and(eq(nodes.organizationId, orgId), eq(nodes.id, id), eq(nodes.branch, MAIN_BRANCH)))
            .limit(1);
        throw anyVersion
            ? new TRPCError({code: "CONFLICT", message: "This node was changed concurrently — refetch and retry"})
            : new TRPCError({code: "NOT_FOUND", message: "Node not found"});
    } else {
        const [base] = await db
            .select()
            .from(nodes)
            .where(and(eq(nodes.organizationId, orgId), eq(nodes.id, id), eq(nodes.versionId, baseVersionId)))
            .limit(1);
        if (!base) throw new TRPCError({code: "NOT_FOUND", message: "Node not found"});
        if (base.isDeleted) throw new TRPCError({code: "NOT_FOUND", message: "Node not found"});
        previous = base;
    }

    const {versionId: _versionId, createdAt: _createdAt, ...carried} = previous;
    const [next] = await db
        .insert(nodes)
        .values({
            ...carried,
            ...patch,
            versionId: createId(),
            branch,
            isHead: true,
            isDeleted: tombstone,
            supersedesVersionId: previous.versionId,
            createdByUserId: userId,
        })
        .returning();
    if (!next) throw new Error("Insert returned no row");

    return {previous, next};
}

export const nodesRouter = router({
    list: gisProcedure
        .input(z.object({
            branch: BranchSchema.default(MAIN_BRANCH),
            types: z.array(NodeTypeSchema).optional()
        }).optional())
        .query(async ({ctx, input}) => {
            const branch = input?.branch ?? MAIN_BRANCH;
            const rows = await ctx.db
                .selectDistinctOn([nodes.id])
                .from(nodes)
                .where(
                    and(
                        eq(nodes.organizationId, ctx.organizationId),
                        eq(nodes.isHead, true),
                        inArray(nodes.branch, [MAIN_BRANCH, branch]),
                        input?.types?.length ? inArray(nodes.type, input.types) : undefined,
                    ),
                )
                .orderBy(nodes.id, sql`(${nodes.branch} = ${branch})
                                       desc`);
            return rows.filter((row) => !row.isDeleted).map(toNodeDto);
        }),

    byId: gisProcedure
        .input(z.object({id: EntityIdSchema, branch: BranchSchema.default(MAIN_BRANCH)}))
        .query(async ({ctx, input}) => {
            const row = await loadEffective(ctx.db, ctx.organizationId, input.id, input.branch);
            if (!row || row.isDeleted) throw new TRPCError({code: "NOT_FOUND", message: "Node not found"});
            return toNodeDto(row);
        }),

    /** Every version of one node, newest first, across all branches — the audit trail the version chain gives for free. */
    history: gisProcedure.input(z.object({id: EntityIdSchema})).query(async ({ctx, input}) => {
        const rows = await ctx.db
            .select()
            .from(nodes)
            .where(and(eq(nodes.organizationId, ctx.organizationId), eq(nodes.id, input.id)))
            .orderBy(desc(nodes.createdAt));
        if (rows.length === 0) throw new TRPCError({code: "NOT_FOUND", message: "Node not found"});

        return rows.map((row) => ({
            versionId: row.versionId,
            branch: row.branch,
            isHead: row.isHead,
            isDeleted: row.isDeleted,
            supersedesVersionId: row.supersedesVersionId,
            createdAt: row.createdAt.toISOString(),
            createdByUserId: row.createdByUserId,
            name: row.name,
            condition: row.condition,
            isOpen: row.isOpen,
        }));
    }),

    create: gisRoleProcedure(...WRITE_ROLES)
        .input(
            z.object({
                id: EntityIdSchema.optional(),
                branch: BranchSchema.default(MAIN_BRANCH),
                type: NodeTypeSchema,
                name: z.string().trim().min(1).max(200),
                location: GeoPointInput,
                condition: ConditionSchema.default("unknown"),
                isOpen: z.boolean().nullable().default(null),
                structureId: EntityIdSchema.nullable().default(null),
                installedAt: z.string().datetime().nullable().default(null),
                junction: JunctionSchema.nullable().default(null),
            }),
        )
        .mutation(async ({ctx, input}) => {
            if (input.type !== "junction" && input.junction) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Only junctions have junction details" });
            }
            if (input.type !== "valve" && input.isOpen !== null) {
                throw new TRPCError({code: "BAD_REQUEST", message: "Only valves have an open/closed state"});
            }
            try {
                return await ctx.db.transaction(async (tx) => {
                    const id = input.id ?? createId();

                    const [existing] = await tx
                        .select({organizationId: assets.organizationId})
                        .from(assets)
                        .where(eq(assets.id, id))
                        .limit(1);

                    if (existing) {
                        // A retry of an offline create that already landed is not an error — hand
                        // back what's there. Anything else claiming an id that's taken is.
                        if (existing.organizationId === ctx.organizationId) {
                            const [head] = await tx
                                .select()
                                .from(nodes)
                                .where(
                                    and(
                                        eq(nodes.organizationId, ctx.organizationId),
                                        eq(nodes.id, id),
                                        eq(nodes.branch, input.branch),
                                        eq(nodes.isHead, true),
                                    ),
                                )
                                .limit(1);
                            if (head && !head.isDeleted) return toNodeDto(head);
                        }
                        throw new TRPCError({code: "CONFLICT", message: "That id is already in use"});
                    }

                    // Checks whether the asset can be housed in the structure specified
                    if (input.structureId) {
                        await assertStructureAllows(tx, ctx.organizationId, input.branch, input.type, input.structureId);
                    }

                    await tx.insert(assets).values({
                        id,
                        organizationId: ctx.organizationId,
                        ownerModule: "gis",
                        label: input.name,
                        assetType: input.type,
                        location: input.location,
                    });

                    const [row] = await tx
                        .insert(nodes)
                        .values({
                            id,
                            organizationId: ctx.organizationId,
                            branch: input.branch,
                            createdByUserId: ctx.session.userId,
                            type: input.type,
                            name: input.name,
                            location: input.location,
                            condition: input.condition,
                            isOpen: input.isOpen,
                            structureId: input.structureId,
                            installedAt: fromIso(input.installedAt),
                            ...junctionColumns(input.junction),
                        })
                        .returning();

                    if (!row) throw new Error("Insert returned no row");

                    return toNodeDto(row);
                });
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    update: gisRoleProcedure(...WRITE_ROLES)
        .input(
            z.object({
                id: EntityIdSchema,
                baseVersionId: z.string().min(1),
                branch: BranchSchema.default(MAIN_BRANCH),
                patch: NodePatchSchema,
            }),
        )
        .mutation(async ({ctx, input}) => {
            const {patch} = input;
            try {
                return await ctx.db.transaction(async (tx) => {
                    const {previous, next} = await editNode(tx, {
                        orgId: ctx.organizationId,
                        userId: ctx.session.userId,
                        id: input.id,
                        branch: input.branch,
                        baseVersionId: input.baseVersionId,
                        tombstone: false,
                        patch: {
                            ...compact({
                                name: patch.name,
                                location: patch.location,
                                condition: patch.condition,
                                isOpen: patch.isOpen,
                                structureId: patch.structureId,
                                installedAt: patch.installedAt === undefined ? undefined : fromIso(patch.installedAt),
                                lastInspectedAt:
                                    patch.lastInspectedAt === undefined ? undefined : fromIso(patch.lastInspectedAt),
                            }),
                            ...(patch.junction !== undefined ? junctionColumns(patch.junction) : {}),
                        },
                    });

                    // Rules that depend on the merged result, checked after the fact — the
                    // transaction rolls back if any of them fail.
                    if (next.type !== "valve" && next.isOpen !== null) {
                        throw new TRPCError({code: "BAD_REQUEST", message: "Only valves have an open/closed state"});
                    }
                    if (next.type !== "junction" && next.mainSizeMm !== null) {
                        throw new TRPCError({ code: "BAD_REQUEST", message: "Only junctions have junction details" });
                    }
                    if (patch.structureId) {
                        await assertStructureAllows(tx, ctx.organizationId, input.branch, next.type, patch.structureId);
                    }

                    // The shared asset registry is NOT versioned, so a branch's rename or move must
                    // not touch it — that would leak an unreconciled edit into everyone's view.
                    if (input.branch === MAIN_BRANCH) {
                        await tx
                            .update(assets)
                            .set({label: next.name, location: next.location})
                            .where(eq(assets.id, next.id));
                    }

                    // Only edits that land on main are facts other modules should react to; a
                    // branch edit is still a proposal until it's reconciled.
                    if (input.branch === MAIN_BRANCH && patch.condition !== undefined && patch.condition !== previous.condition) {
                        await tx.insert(domainEvents).values({
                            organizationId: ctx.organizationId,
                            type: "asset.condition_changed",
                            sourceModule: "gis",
                            payload: {
                                assetId: next.id,
                                from: previous.condition,
                                to: next.condition,
                                changedByUserId: ctx.session.userId,
                            },
                        });
                    }
                    return toNodeDto(next);
                });
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    delete: gisRoleProcedure(...DELETE_ROLES)
        .input(z.object({
            id: EntityIdSchema,
            baseVersionId: z.string().min(1),
            branch: BranchSchema.default(MAIN_BRANCH)
        }))
        .mutation(async ({ctx, input}) => {
            try {
                await ctx.db.transaction(async (tx) => {
                    await assertNodeHasNoPipes(tx, ctx.organizationId, input.branch, input.id);
                    await assertNodeNotUsedByDma(tx, ctx.organizationId, input.branch, input.id);
                    await assertNodeNotController(tx, ctx.organizationId, input.id);

                    await editNode(tx, {
                        orgId: ctx.organizationId,
                        userId: ctx.session.userId,
                        id: input.id,
                        branch: input.branch,
                        baseVersionId: input.baseVersionId,
                        tombstone: true,
                        patch: {},
                    });
                });
                return {ok: true as const};
            } catch (err) {
                rethrowDbError(err);
            }
        }),
});