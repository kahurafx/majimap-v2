import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import {
    assets,
    conditionLogs,
    nodes,
    pipes,
    structures,
    valveStateLogs,
    type AssetKind,
    type Database,
} from "@majimap/db";
import { ConditionSchema, type Condition } from "@majimap/shared-types";
import { gisProcedure, gisRoleProcedure, router } from "../trpc";
import { GIS_WRITE_ROLES, editVersioned, emitConditionChanged, loadEffective } from "./versioned";
import { BranchSchema, EntityIdSchema, MAIN_BRANCH, rethrowDbError } from "./versioning";

type ConditionLogRow = typeof conditionLogs.$inferSelect;
type ValveStateLogRow = typeof valveStateLogs.$inferSelect;

/**
 * The shared `ConditionLog` shape — `nodeId` or `pipeId`, exactly one — plus
 * `structureId`, which that shape predates, and the asset's kind and the
 * branch it was logged on. For a structure's log both `nodeId` and `pipeId`
 * are null, so the shared schema's own "exactly one" check rejects it: extend
 * `ConditionLogSchema` with `structureId` before parsing these with it.
 */
export function toConditionLogDto(row: ConditionLogRow) {
    return {
        id: row.id,
        assetId: row.assetId,
        assetType: row.assetKind,
        nodeId: row.assetKind === "node" ? row.assetId : null,
        pipeId: row.assetKind === "pipe" ? row.assetId : null,
        structureId: row.assetKind === "structure" ? row.assetId : null,
        condition: row.condition,
        note: row.note,
        recordedAt: row.recordedAt.toISOString(),
        recordedByUserId: row.recordedByUserId,
        syncedAt: row.syncedAt.toISOString(),
        branch: row.branch,
    };
}

/** The shared `ValveStateLog` shape, plus the note and the branch it was logged on. */
export function toValveStateLogDto(row: ValveStateLogRow) {
    return {
        id: row.id,
        nodeId: row.valveId,
        isOpen: row.isOpen,
        changedAt: row.changedAt.toISOString(),
        changedByUserId: row.changedByUserId,
        syncedAt: row.syncedAt.toISOString(),
        note: row.note,
        branch: row.branch,
    };
}

/**
 * How far ahead of the server a device's clock may claim something happened.
 * "The newest log wins" means a log dated far in the future would outrank every
 * real inspection that follows it, so an obviously wrong date is refused — but
 * not a device that's merely a little fast, since turning away a technician's
 * day of offline work over a few minutes of clock drift would be much worse.
 */
const MAX_CLOCK_AHEAD_MS = 24 * 60 * 60 * 1000;

const NoteInput = z.string().trim().max(2000).nullable().default(null);
const TimeInput = z.string().datetime();
const LimitInput = z.number().int().min(1).max(200).default(50);

function parseWhen(value: string | undefined): Date {
    const when = value ? new Date(value) : new Date();
    if (when.getTime() > Date.now() + MAX_CLOCK_AHEAD_MS) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That time is more than a day in the future — check the device's clock",
        });
    }
    return when;
}

const cleanNote = (note: string | null) => (note && note.length > 0 ? note : null);

/** What kind of asset an id is, from the shared registry — which also confirms it's this organization's and a GIS asset. */
async function resolveAssetKind(db: Database, orgId: string, assetId: string): Promise<AssetKind> {
    const [asset] = await db
        .select({ assetType: assets.assetType, ownerModule: assets.ownerModule })
        .from(assets)
        .where(and(eq(assets.id, assetId), eq(assets.organizationId, orgId)))
        .limit(1);
    if (!asset || asset.ownerModule !== "gis") throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });
    if (asset.assetType === "dma") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A DMA is an area, not something that gets inspected" });
    }
    return asset.assetType === "pipe" ? "pipe" : asset.assetType === "structure" ? "structure" : "node";
}

const tableFor = (kind: AssetKind) => (kind === "pipe" ? pipes : kind === "structure" ? structures : nodes);

type Inspectable = { versionId: string; isDeleted: boolean; condition: Condition; lastInspectedAt?: Date | null };

/**
 * How a record landed:
 * - `applied`: the asset's own record was updated to match.
 * - `unchanged`: nothing about the asset needed to change.
 * - `stale`: a newer observation already exists, so this one was kept as history
 *   but the asset was left alone — an offline device syncing last week's
 *   inspection must not undo this morning's.
 * - `replayed`: this exact record had already arrived (a retried sync); nothing happened.
 */
type Outcome = "applied" | "unchanged" | "stale" | "replayed";

export const logsRouter = router({
    /**
     * Log an inspection and bring the asset's condition (and, where it has one,
     * its last-inspected date) into line with it. The log is a fact and is
     * always kept; the asset update is an ordinary versioned edit on `branch`,
     * so on a field branch it's a proposal like any other.
     */
    recordCondition: gisRoleProcedure(...GIS_WRITE_ROLES)
        .input(
            z.object({
                /** Supply one from the device so a retried sync can't create a duplicate. */
                id: EntityIdSchema.optional(),
                assetId: EntityIdSchema,
                branch: BranchSchema.default(MAIN_BRANCH),
                condition: ConditionSchema,
                note: NoteInput,
                /** When the inspection happened, by the device's clock. Defaults to now. */
                recordedAt: TimeInput.optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const recordedAt = parseWhen(input.recordedAt);
            const note = cleanNote(input.note);
            try {
                return await ctx.db.transaction(async (tx) => {
                    const id = input.id ?? createId();
                    const result = (row: ConditionLogRow, outcome: Outcome) => ({ log: toConditionLogDto(row), outcome });

                    const [existing] = await tx.select().from(conditionLogs).where(eq(conditionLogs.id, id)).limit(1);
                    if (existing) {
                        if (existing.organizationId !== ctx.organizationId) {
                            throw new TRPCError({ code: "CONFLICT", message: "That id is already in use" });
                        }
                        return result(existing, "replayed");
                    }

                    const kind = await resolveAssetKind(tx, ctx.organizationId, input.assetId);
                    const table = tableFor(kind);
                    const current = (await loadEffective(tx, table, {
                        orgId: ctx.organizationId,
                        id: input.assetId,
                        branch: input.branch,
                    })) as Inspectable | undefined;
                    if (!current || current.isDeleted) throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });

                    const [latest] = await tx
                        .select({ recordedAt: conditionLogs.recordedAt })
                        .from(conditionLogs)
                        .where(and(eq(conditionLogs.organizationId, ctx.organizationId), eq(conditionLogs.assetId, input.assetId)))
                        .orderBy(desc(conditionLogs.recordedAt))
                        .limit(1);
                    const stale = latest !== undefined && latest.recordedAt.getTime() > recordedAt.getTime();

                    const [row] = await tx
                        .insert(conditionLogs)
                        .values({
                            id,
                            organizationId: ctx.organizationId,
                            assetId: input.assetId,
                            assetKind: kind,
                            branch: input.branch,
                            condition: input.condition,
                            note,
                            recordedAt,
                            recordedByUserId: ctx.session.userId,
                        })
                        .returning();
                    if (!row) throw new Error("Insert returned no row");
                    if (stale) return result(row, "stale");

                    const patch: Record<string, unknown> = {};
                    if (current.condition !== input.condition) patch.condition = input.condition;
                    // Pipes have no last-inspected date, so only nodes and structures move it.
                    if (kind !== "pipe" && (!current.lastInspectedAt || current.lastInspectedAt.getTime() < recordedAt.getTime())) {
                        patch.lastInspectedAt = recordedAt;
                    }
                    if (Object.keys(patch).length === 0) return result(row, "unchanged");

                    const { previous, next } = await editVersioned(tx, table, {
                        orgId: ctx.organizationId,
                        userId: ctx.session.userId,
                        id: input.assetId,
                        branch: input.branch,
                        baseVersionId: current.versionId,
                        tombstone: false,
                        entity: "Asset",
                        patch,
                    });
                    if (input.branch === MAIN_BRANCH && patch.condition !== undefined) {
                        await emitConditionChanged(tx, {
                            orgId: ctx.organizationId,
                            assetId: input.assetId,
                            from: previous.condition,
                            to: next.condition,
                            userId: ctx.session.userId,
                        });
                    }
                    return result(row, "applied");
                });
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    /** Log that a valve was opened or closed, and bring the valve's recorded state into line — same rules as an inspection. */
    recordValveState: gisRoleProcedure(...GIS_WRITE_ROLES)
        .input(
            z.object({
                id: EntityIdSchema.optional(),
                valveId: EntityIdSchema,
                branch: BranchSchema.default(MAIN_BRANCH),
                isOpen: z.boolean(),
                note: NoteInput,
                /** When the valve was operated, by the device's clock. Defaults to now. */
                changedAt: TimeInput.optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const changedAt = parseWhen(input.changedAt);
            const note = cleanNote(input.note);
            try {
                return await ctx.db.transaction(async (tx) => {
                    const id = input.id ?? createId();
                    const result = (row: ValveStateLogRow, outcome: Outcome) => ({ log: toValveStateLogDto(row), outcome });

                    const [existing] = await tx.select().from(valveStateLogs).where(eq(valveStateLogs.id, id)).limit(1);
                    if (existing) {
                        if (existing.organizationId !== ctx.organizationId) {
                            throw new TRPCError({ code: "CONFLICT", message: "That id is already in use" });
                        }
                        return result(existing, "replayed");
                    }

                    const valve = await loadEffective(tx, nodes, { orgId: ctx.organizationId, id: input.valveId, branch: input.branch });
                    if (!valve || valve.isDeleted) throw new TRPCError({ code: "NOT_FOUND", message: "Valve not found" });
                    if (valve.type !== "valve") throw new TRPCError({ code: "BAD_REQUEST", message: "That node isn't a valve" });

                    const [latest] = await tx
                        .select({ changedAt: valveStateLogs.changedAt })
                        .from(valveStateLogs)
                        .where(and(eq(valveStateLogs.organizationId, ctx.organizationId), eq(valveStateLogs.valveId, input.valveId)))
                        .orderBy(desc(valveStateLogs.changedAt))
                        .limit(1);
                    const stale = latest !== undefined && latest.changedAt.getTime() > changedAt.getTime();

                    const [row] = await tx
                        .insert(valveStateLogs)
                        .values({
                            id,
                            organizationId: ctx.organizationId,
                            valveId: input.valveId,
                            branch: input.branch,
                            isOpen: input.isOpen,
                            note,
                            changedAt,
                            changedByUserId: ctx.session.userId,
                        })
                        .returning();
                    if (!row) throw new Error("Insert returned no row");
                    if (stale) return result(row, "stale");
                    if (valve.isOpen === input.isOpen) return result(row, "unchanged");

                    await editVersioned(tx, nodes, {
                        orgId: ctx.organizationId,
                        userId: ctx.session.userId,
                        id: input.valveId,
                        branch: input.branch,
                        baseVersionId: valve.versionId,
                        tombstone: false,
                        entity: "Valve",
                        patch: { isOpen: input.isOpen },
                    });
                    return result(row, "applied");
                });
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    /** An asset's inspections, newest first by when they happened. */
    conditionHistory: gisProcedure
        .input(z.object({ assetId: EntityIdSchema, limit: LimitInput }))
        .query(async ({ ctx, input }) => {
            await resolveAssetKind(ctx.db, ctx.organizationId, input.assetId);
            const rows = await ctx.db
                .select()
                .from(conditionLogs)
                .where(and(eq(conditionLogs.organizationId, ctx.organizationId), eq(conditionLogs.assetId, input.assetId)))
                .orderBy(desc(conditionLogs.recordedAt))
                .limit(input.limit);
            return rows.map(toConditionLogDto);
        }),

    /** A valve's open/close history, newest first by when it happened. */
    valveHistory: gisProcedure
        .input(z.object({ valveId: EntityIdSchema, limit: LimitInput }))
        .query(async ({ ctx, input }) => {
            await resolveAssetKind(ctx.db, ctx.organizationId, input.valveId);
            const rows = await ctx.db
                .select()
                .from(valveStateLogs)
                .where(and(eq(valveStateLogs.organizationId, ctx.organizationId), eq(valveStateLogs.valveId, input.valveId)))
                .orderBy(desc(valveStateLogs.changedAt))
                .limit(input.limit);
            return rows.map(toValveStateLogDto);
        }),

    /** Recent inspections across the whole organization — what an alerts or activity view is built from. */
    conditionFeed: gisProcedure
        .input(
            z.object({
                /** Only these conditions, e.g. `["poor", "critical"]` for an alerts view. */
                conditions: z.array(ConditionSchema).min(1).optional(),
                since: TimeInput.optional(),
                limit: LimitInput,
            }),
        )
        .query(async ({ ctx, input }) => {
            const rows = await ctx.db
                .select()
                .from(conditionLogs)
                .where(
                    and(
                        eq(conditionLogs.organizationId, ctx.organizationId),
                        input.conditions ? inArray(conditionLogs.condition, input.conditions) : undefined,
                        input.since ? gte(conditionLogs.recordedAt, new Date(input.since)) : undefined,
                    ),
                )
                .orderBy(desc(conditionLogs.recordedAt))
                .limit(input.limit);
            return rows.map(toConditionLogDto);
        }),
})