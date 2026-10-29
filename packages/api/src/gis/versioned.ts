import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { assets, domainEvents, type Database, type LatLng } from "@majimap/db";
import { MAIN_BRANCH } from "./versioning";

export const GIS_WRITE_ROLES = ["admin", "gis_engineer", "field_technician"] as const;
export const GIS_DELETE_ROLES = ["admin", "gis_engineer"] as const;

/** The columns `versionedColumns()` and `organizationScopedColumns()` put on every versioned table. */
export type VersionedRow = {
    versionId: string;
    id: string;
    organizationId: string;
    branch: string;
    isHead: boolean;
    isDeleted: boolean;
    supersedesVersionId: string | null;
    createdAt: Date;
    createdByUserId: string;
};

export type VersionedTable = PgTable & {
    versionId: PgColumn;
    id: PgColumn;
    organizationId: PgColumn;
    branch: PgColumn;
    isHead: PgColumn;
    isDeleted: PgColumn;
    supersedesVersionId: PgColumn;
    createdAt: PgColumn;
    createdByUserId: PgColumn;
    $inferSelect: VersionedRow;
};

/*
 * Everything below works on ANY table built from versionedColumns(), so the
 * concurrency-sensitive part of branch versioning — which row is the head,
 * how a head gets superseded, what a branch's first edit is built from —
 * exists once. Drizzle can't prove a generic table's insert/update shapes, so
 * those calls cast (and `from()` is handed the base PgTable, because its
 * conditional type can't be evaluated for a generic one); the casts are
 * confined to this file, and the same behaviours are exercised per entity by
 * each router's integration tests.
 */

/**
 * A branch's view of the entities: for each id, the branch's head if it has
 * one, otherwise main's. Tombstones are dropped AFTER that overlay, so a
 * branch can hide something that still exists on main.
 */
export async function listEffective<T extends VersionedTable>(
    db: Database,
    table: T,
    args: { orgId: string; branch: string; where?: SQL | undefined },
): Promise<T["$inferSelect"][]> {
    const rows = await db
        .selectDistinctOn([table.id])
        .from(table as PgTable)
        .where(
            and(
                eq(table.organizationId, args.orgId),
                eq(table.isHead, true),
                inArray(table.branch, [MAIN_BRANCH, args.branch]),
                args.where,
            ),
        )
        .orderBy(table.id, sql`(${table.branch} = ${args.branch}) desc`);
    return (rows as unknown as T["$inferSelect"][]).filter((row) => !row.isDeleted);
}

/** One entity as a branch sees it. Returns tombstones too — callers decide what a deleted entity means. */
export async function loadEffective<T extends VersionedTable>(
    db: Database,
    table: T,
    args: { orgId: string; id: string; branch: string },
): Promise<T["$inferSelect"] | undefined> {
    const [row] = (await db
        .select()
        .from(table as PgTable)
        .where(
            and(
                eq(table.organizationId, args.orgId),
                eq(table.id, args.id),
                eq(table.isHead, true),
                inArray(table.branch, [MAIN_BRANCH, args.branch]),
            ),
        )
        .orderBy(sql`(${table.branch} = ${args.branch}) desc`)
        .limit(1)) as unknown as T["$inferSelect"][];
    return row;
}

/** Every version of one entity across all branches, newest first. */
export async function loadHistory<T extends VersionedTable>(
    db: Database,
    table: T,
    args: { orgId: string; id: string },
): Promise<T["$inferSelect"][]> {
    const rows = await db
        .select()
        .from(table as PgTable)
        .where(and(eq(table.organizationId, args.orgId), eq(table.id, args.id)))
        .orderBy(desc(table.createdAt));
    return rows as unknown as T["$inferSelect"][];
}

/** The audit-trail shape every entity's `history` endpoint returns. */
export function toHistoryEntry(row: VersionedRow) {
    return {
        versionId: row.versionId,
        branch: row.branch,
        isHead: row.isHead,
        isDeleted: row.isDeleted,
        supersedesVersionId: row.supersedesVersionId,
        createdAt: row.createdAt.toISOString(),
        createdByUserId: row.createdByUserId,
    };
}

/**
 * Entity ids may come from the client (an offline device names what it
 * creates), so claiming one has three outcomes: it's free (returns null); it's
 * a retry of a create that already landed on this branch (returns what's
 * there, so the retry is a no-op instead of a duplicate); or it's taken by
 * something else, in this organization or another (CONFLICT, saying nothing
 * about which).
 */
export async function claimEntityId<T extends VersionedTable>(
    db: Database,
    table: T,
    args: { orgId: string; id: string; branch: string },
): Promise<T["$inferSelect"] | null> {
    const [existing] = await db
        .select({ organizationId: assets.organizationId })
        .from(assets)
        .where(eq(assets.id, args.id))
        .limit(1);
    if (!existing) return null;

    if (existing.organizationId === args.orgId) {
        const [head] = (await db
            .select()
            .from(table as PgTable)
            .where(
                and(
                    eq(table.organizationId, args.orgId),
                    eq(table.id, args.id),
                    eq(table.branch, args.branch),
                    eq(table.isHead, true),
                ),
            )
            .limit(1)) as unknown as T["$inferSelect"][];
        if (head && !head.isDeleted) return head;
    }
    throw new TRPCError({ code: "CONFLICT", message: "That id is already in use" });
}

export type EditArgs = {
    orgId: string;
    userId: string;
    id: string;
    branch: string;
    baseVersionId: string;
    /** Column values to change. Everything else is carried over from the version being superseded. */
    patch: Record<string, unknown>;
    tombstone: boolean;
    /** For error messages: "Structure", "Pipe". */
    entity: string;
};

/**
 * The versioned write. Never changes a row's data — it supersedes it.
 *
 * - The branch already has a head for this entity: the edit must be based on
 *   that head (otherwise it's stale). The head is flipped with a
 *   compare-and-set UPDATE, so of two racing edits exactly one flips it and
 *   the other sees zero rows and gets CONFLICT.
 * - No head on the branch (a feature branch's first edit): the new row is
 *   built from `baseVersionId` — the version the client actually edited — NOT
 *   from main's current head, and main's row is left alone. That keeps
 *   branch = base + exactly the client's changes, which is what lets a
 *   reconcile tell the branch's edits apart from main's concurrent ones.
 * - No head on main: either it never existed (NOT_FOUND) or a concurrent edit
 *   just superseded the head we expected (CONFLICT).
 */
export async function editVersioned<T extends VersionedTable>(
    db: Database,
    table: T,
    args: EditArgs,
): Promise<{ previous: T["$inferSelect"]; next: T["$inferSelect"] }> {
    type Row = T["$inferSelect"];
    const { orgId, userId, id, branch, baseVersionId, patch, tombstone, entity } = args;
    const noun = entity.toLowerCase();
    const notFound = () => new TRPCError({ code: "NOT_FOUND", message: `${entity} not found` });
    const concurrent = () =>
        new TRPCError({ code: "CONFLICT", message: `This ${noun} was changed concurrently — refetch and retry` });

    const [branchHead] = (await db
        .select()
        .from(table as PgTable)
        .where(
            and(
                eq(table.organizationId, orgId),
                eq(table.id, id),
                eq(table.branch, branch),
                eq(table.isHead, true),
            ),
        )
        .limit(1)) as unknown as Row[];

    let previous: Row;

    if (branchHead) {
        if (branchHead.isDeleted) throw notFound();
        if (branchHead.versionId !== baseVersionId) {
            throw new TRPCError({
                code: "CONFLICT",
                message: `This ${noun} changed since you loaded it — refetch and reapply your edit`,
            });
        }
        const flipped = await db
            .update(table)
            .set({ isHead: false } as never)
            .where(and(eq(table.versionId, branchHead.versionId), eq(table.isHead, true)))
            .returning({ versionId: table.versionId });
        if (flipped.length === 0) throw concurrent();
        previous = branchHead;
    } else if (branch === MAIN_BRANCH) {
        const [anyVersion] = await db
            .select({ versionId: table.versionId })
            .from(table as PgTable)
            .where(and(eq(table.organizationId, orgId), eq(table.id, id), eq(table.branch, MAIN_BRANCH)))
            .limit(1);
        throw anyVersion ? concurrent() : notFound();
    } else {
        const [base] = (await db
            .select()
            .from(table as PgTable)
            .where(and(eq(table.organizationId, orgId), eq(table.id, id), eq(table.versionId, baseVersionId)))
            .limit(1)) as unknown as Row[];
        if (!base || base.isDeleted) throw notFound();
        previous = base;
    }

    const { versionId: _versionId, createdAt: _createdAt, ...carried } = previous;
    const [next] = (await db
        .insert(table)
        .values({
            ...carried,
            ...patch,
            versionId: createId(),
            branch,
            isHead: true,
            isDeleted: tombstone,
            supersedesVersionId: previous.versionId,
            createdByUserId: userId,
        } as never)
        .returning()) as unknown as Row[];
    if (!next) throw new Error("Insert returned no row");

    return { previous, next };
}

/** The shared asset registry isn't versioned: only a change that lands on main may touch it. */
export async function syncAssetRegistry(
    db: Database,
    id: string,
    fields: { label: string; location?: LatLng | null },
) {
    await db.update(assets).set(fields).where(eq(assets.id, id));
}

/** A condition change is a fact other modules may react to — but only once it's on main. */
export async function emitConditionChanged(
    db: Database,
    args: { orgId: string; assetId: string; from: string; to: string; userId: string },
) {
    await db.insert(domainEvents).values({
        organizationId: args.orgId,
        type: "asset.condition_changed",
        sourceModule: "gis",
        payload: { assetId: args.assetId, from: args.from, to: args.to, changedByUserId: args.userId },
    });
}