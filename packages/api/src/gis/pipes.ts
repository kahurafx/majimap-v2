import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { assets, nodes, pipes, type Database } from "@majimap/db";
import { ConditionSchema, PipeSchema, type Pipe } from "@majimap/shared-types";
import { gisProcedure, gisRoleProcedure, router } from "../trpc";
import { pathLengthMetres } from "./geo";
import {
    GIS_DELETE_ROLES,
    GIS_WRITE_ROLES,
    claimEntityId,
    editVersioned,
    emitConditionChanged,
    listEffective,
    loadEffective,
    loadHistory,
    toHistoryEntry,
} from "./versioned";
import {
    BranchSchema,
    EntityIdSchema,
    GeoPointInput,
    MAIN_BRANCH,
    compact,
    rethrowDbError,
} from "./versioning";

type PipeRow = typeof pipes.$inferSelect;

/** The shape the frontends already consume (`Pipe`), plus which version and branch this is. */
export type PipeDto = Pipe & { versionId: string; branch: string };

export function toPipeDto(row: PipeRow): PipeDto {
    return {
        id: row.id,
        versionId: row.versionId,
        branch: row.branch,
        fromNodeId: row.fromNodeId,
        toNodeId: row.toNodeId,
        path: row.path,
        material: row.material,
        diameterMm: row.diameterMm,
        condition: row.condition,
        lengthM: row.lengthM,
    };
}

const MaterialSchema = PipeSchema.shape.material;
const PathInput = z.array(GeoPointInput).min(2).max(10_000);
const DiameterInput = z.number().positive().max(5_000);

const PipePatchSchema = z
    .object({
        path: PathInput,
        material: MaterialSchema,
        diameterMm: DiameterInput,
        condition: ConditionSchema,
    })
    .partial()
    .refine((patch) => Object.values(patch).some((v) => v !== undefined), "Patch is empty");

/** A pipe with no length can't carry water, and a zero would also make it vanish from length-weighted reports. */
function lengthOrThrow(path: readonly { lat: number; lng: number }[]): number {
    const length = pathLengthMetres(path);
    if (!(length > 0)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A pipe's path must have some length" });
    }
    return length;
}

/** Both ends have to be nodes the caller's branch can actually see, and different ones. */
async function assertEndpoints(db: Database, orgId: string, branch: string, fromNodeId: string, toNodeId: string) {
    if (fromNodeId === toNodeId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A pipe needs two different end nodes" });
    }
    const found = await listEffective(db, nodes, {
        orgId,
        branch,
        where: inArray(nodes.id, [fromNodeId, toNodeId]),
    });
    if (found.length !== 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Both ends of a pipe must be existing nodes" });
    }
}

/**
 * A node can't be deleted while pipes still end on it — judged by what the
 * caller's branch sees (a pipe already deleted on this branch no longer
 * blocks it). Called by `nodes.delete`.
 */
export async function assertNodeHasNoPipes(db: Database, orgId: string, branch: string, nodeId: string) {
    const candidates = await db
        .selectDistinct({ id: pipes.id })
        .from(pipes)
        .where(
            and(
                eq(pipes.organizationId, orgId),
                eq(pipes.isHead, true),
                inArray(pipes.branch, [MAIN_BRANCH, branch]),
                or(eq(pipes.fromNodeId, nodeId), eq(pipes.toNodeId, nodeId)),
            ),
        );
    if (candidates.length === 0) return;

    const effective = await listEffective(db, pipes, {
        orgId,
        branch,
        where: inArray(
            pipes.id,
            candidates.map((c) => c.id),
        ),
    });
    const attached = effective.filter((pipe) => pipe.fromNodeId === nodeId || pipe.toNodeId === nodeId);
    if (attached.length > 0) {
        const plural = attached.length === 1;
        throw new TRPCError({
            code: "CONFLICT",
            message: `${attached.length} pipe${plural ? " is" : "s are"} still connected to this node — delete ${plural ? "it" : "them"} first`,
        });
    }
}

export const pipesRouter = router({
    list: gisProcedure
        .input(z.object({ branch: BranchSchema.default(MAIN_BRANCH) }).optional())
        .query(async ({ ctx, input }) => {
            const rows = await listEffective(ctx.db, pipes, {
                orgId: ctx.organizationId,
                branch: input?.branch ?? MAIN_BRANCH,
            });
            return rows.map(toPipeDto);
        }),

    byId: gisProcedure
        .input(z.object({ id: EntityIdSchema, branch: BranchSchema.default(MAIN_BRANCH) }))
        .query(async ({ ctx, input }) => {
            const row = await loadEffective(ctx.db, pipes, {
                orgId: ctx.organizationId,
                id: input.id,
                branch: input.branch,
            });
            if (!row || row.isDeleted) throw new TRPCError({ code: "NOT_FOUND", message: "Pipe not found" });
            return toPipeDto(row);
        }),

    history: gisProcedure.input(z.object({ id: EntityIdSchema })).query(async ({ ctx, input }) => {
        const rows = await loadHistory(ctx.db, pipes, { orgId: ctx.organizationId, id: input.id });
        if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Pipe not found" });
        return rows.map((row) => ({
            ...toHistoryEntry(row),
            condition: row.condition,
            material: row.material,
            diameterMm: row.diameterMm,
            lengthM: row.lengthM,
        }));
    }),

    /** The length is always computed from the path; there's deliberately no way to supply one. */
    create: gisRoleProcedure(...GIS_WRITE_ROLES)
        .input(
            z.object({
                id: EntityIdSchema.optional(),
                branch: BranchSchema.default(MAIN_BRANCH),
                fromNodeId: EntityIdSchema,
                toNodeId: EntityIdSchema,
                path: PathInput,
                material: MaterialSchema.default("unknown"),
                diameterMm: DiameterInput,
                condition: ConditionSchema.default("unknown"),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const lengthM = lengthOrThrow(input.path);
            try {
                return await ctx.db.transaction(async (tx) => {
                    const id = input.id ?? createId();
                    const replay = await claimEntityId(tx, pipes, {
                        orgId: ctx.organizationId,
                        id,
                        branch: input.branch,
                    });
                    if (replay) return toPipeDto(replay);

                    await assertEndpoints(tx, ctx.organizationId, input.branch, input.fromNodeId, input.toNodeId);

                    await tx.insert(assets).values({
                        id,
                        organizationId: ctx.organizationId,
                        ownerModule: "gis",
                        label: `Pipe ${id}`,
                        assetType: "pipe",
                    });
                    const [row] = await tx
                        .insert(pipes)
                        .values({
                            id,
                            organizationId: ctx.organizationId,
                            branch: input.branch,
                            createdByUserId: ctx.session.userId,
                            fromNodeId: input.fromNodeId,
                            toNodeId: input.toNodeId,
                            path: input.path,
                            material: input.material,
                            diameterMm: input.diameterMm,
                            condition: input.condition,
                            lengthM,
                        })
                        .returning();
                    if (!row) throw new Error("Insert returned no row");
                    return toPipeDto(row);
                });
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    /** The end nodes are fixed once a pipe exists; to reconnect it, delete it and draw a new one. */
    update: gisRoleProcedure(...GIS_WRITE_ROLES)
        .input(
            z.object({
                id: EntityIdSchema,
                baseVersionId: z.string().min(1),
                branch: BranchSchema.default(MAIN_BRANCH),
                patch: PipePatchSchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { patch } = input;
            const lengthM = patch.path ? lengthOrThrow(patch.path) : undefined;
            try {
                return await ctx.db.transaction(async (tx) => {
                    const { previous, next } = await editVersioned(tx, pipes, {
                        orgId: ctx.organizationId,
                        userId: ctx.session.userId,
                        id: input.id,
                        branch: input.branch,
                        baseVersionId: input.baseVersionId,
                        tombstone: false,
                        entity: "Pipe",
                        patch: compact({
                            path: patch.path,
                            lengthM,
                            material: patch.material,
                            diameterMm: patch.diameterMm,
                            condition: patch.condition,
                        }),
                    });

                    if (
                        input.branch === MAIN_BRANCH &&
                        patch.condition !== undefined &&
                        patch.condition !== previous.condition
                    ) {
                        await emitConditionChanged(tx, {
                            orgId: ctx.organizationId,
                            assetId: next.id,
                            from: previous.condition,
                            to: next.condition,
                            userId: ctx.session.userId,
                        });
                    }
                    return toPipeDto(next);
                });
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    delete: gisRoleProcedure(...GIS_DELETE_ROLES)
        .input(z.object({ id: EntityIdSchema, baseVersionId: z.string().min(1), branch: BranchSchema.default(MAIN_BRANCH) }))
        .mutation(async ({ ctx, input }) => {
            try {
                await ctx.db.transaction(async (tx) => {
                    await editVersioned(tx, pipes, {
                        orgId: ctx.organizationId,
                        userId: ctx.session.userId,
                        id: input.id,
                        branch: input.branch,
                        baseVersionId: input.baseVersionId,
                        tombstone: true,
                        entity: "Pipe",
                        patch: {},
                    });
                });
                return { ok: true as const };
            } catch (err) {
                rethrowDbError(err);
            }
        }),
});