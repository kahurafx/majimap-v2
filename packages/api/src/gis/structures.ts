import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { assets, nodes, structures, type Database } from "@majimap/db";
import { ConditionSchema, StructureTypeSchema, type Structure } from "@majimap/shared-types";
import { gisProcedure, gisRoleProcedure, router } from "../trpc";
import {
    GIS_DELETE_ROLES,
    GIS_WRITE_ROLES,
    claimEntityId,
    editVersioned,
    emitConditionChanged,
    listEffective,
    loadEffective,
    loadHistory,
    syncAssetRegistry,
    toHistoryEntry,
} from "./versioned";
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

type StructureRow = typeof structures.$inferSelect;

/** The shape the frontends already consume (`Structure`), plus which version and branch this is. */
export type StructureDto = Structure & { versionId: string; branch: string };

export function toStructureDto(row: StructureRow): StructureDto {
    return {
        id: row.id,
        versionId: row.versionId,
        branch: row.branch,
        type: row.type,
        name: row.name,
        location: row.location,
        condition: row.condition,
        installedAt: toIso(row.installedAt),
        lastInspectedAt: toIso(row.lastInspectedAt),
    };
}

/** `type` is deliberately not patchable: changing it could silently break the attachment rules of whatever it houses. */
const StructurePatchSchema = z
    .object({
        name: z.string().trim().min(1).max(200),
        location: GeoPointInput,
        condition: ConditionSchema,
        installedAt: z.string().datetime().nullable(),
        lastInspectedAt: z.string().datetime().nullable(),
    })
    .partial()
    .refine((patch) => Object.values(patch).some((v) => v !== undefined), "Patch is empty");

/**
 * A structure can't be deleted while it still houses something — judged by
 * what the CALLER'S BRANCH sees, not by main alone: a node that's housed on
 * main but deleted (or moved out) on this branch no longer blocks the delete
 * here, though it still would on main.
 */
async function assertHousesNothing(db: Database, orgId: string, branch: string, structureId: string) {
    const candidates = await db
        .selectDistinct({ id: nodes.id })
        .from(nodes)
        .where(
            and(
                eq(nodes.organizationId, orgId),
                eq(nodes.structureId, structureId),
                eq(nodes.isHead, true),
                inArray(nodes.branch, [MAIN_BRANCH, branch]),
            ),
        );
    if (candidates.length === 0) return;

    const effective = await listEffective(db, nodes, {
        orgId,
        branch,
        where: inArray(
            nodes.id,
            candidates.map((c) => c.id),
        ),
    });
    const housed = effective.filter((node) => node.structureId === structureId);
    if (housed.length > 0) {
        const plural = housed.length === 1;
        throw new TRPCError({
            code: "CONFLICT",
            message: `This structure still houses ${housed.length} asset${plural ? "" : "s"} — move or delete ${plural ? "it" : "them"} first`,
        });
    }
}

export const structuresRouter = router({
    list: gisProcedure
        .input(
            z
                .object({ branch: BranchSchema.default(MAIN_BRANCH), types: z.array(StructureTypeSchema).optional() })
                .optional(),
        )
        .query(async ({ ctx, input }) => {
            const rows = await listEffective(ctx.db, structures, {
                orgId: ctx.organizationId,
                branch: input?.branch ?? MAIN_BRANCH,
                where: input?.types?.length ? inArray(structures.type, input.types) : undefined,
            });
            return rows.map(toStructureDto);
        }),

    byId: gisProcedure
        .input(z.object({ id: EntityIdSchema, branch: BranchSchema.default(MAIN_BRANCH) }))
        .query(async ({ ctx, input }) => {
            const row = await loadEffective(ctx.db, structures, {
                orgId: ctx.organizationId,
                id: input.id,
                branch: input.branch,
            });
            if (!row || row.isDeleted) throw new TRPCError({ code: "NOT_FOUND", message: "Structure not found" });
            return toStructureDto(row);
        }),

    history: gisProcedure.input(z.object({ id: EntityIdSchema })).query(async ({ ctx, input }) => {
        const rows = await loadHistory(ctx.db, structures, { orgId: ctx.organizationId, id: input.id });
        if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Structure not found" });
        return rows.map((row) => ({ ...toHistoryEntry(row), name: row.name, condition: row.condition }));
    }),

    create: gisRoleProcedure(...GIS_WRITE_ROLES)
        .input(
            z.object({
                id: EntityIdSchema.optional(),
                branch: BranchSchema.default(MAIN_BRANCH),
                type: StructureTypeSchema,
                name: z.string().trim().min(1).max(200),
                location: GeoPointInput,
                condition: ConditionSchema.default("unknown"),
                installedAt: z.string().datetime().nullable().default(null),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            try {
                return await ctx.db.transaction(async (tx) => {
                    const id = input.id ?? createId();
                    const replay = await claimEntityId(tx, structures, {
                        orgId: ctx.organizationId,
                        id,
                        branch: input.branch,
                    });
                    if (replay) return toStructureDto(replay);

                    await tx.insert(assets).values({
                        id,
                        organizationId: ctx.organizationId,
                        ownerModule: "gis",
                        label: input.name,
                        assetType: "structure",
                        location: input.location,
                    });
                    const [row] = await tx
                        .insert(structures)
                        .values({
                            id,
                            organizationId: ctx.organizationId,
                            branch: input.branch,
                            createdByUserId: ctx.session.userId,
                            type: input.type,
                            name: input.name,
                            location: input.location,
                            condition: input.condition,
                            installedAt: fromIso(input.installedAt),
                        })
                        .returning();
                    if (!row) throw new Error("Insert returned no row");
                    return toStructureDto(row);
                });
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    update: gisRoleProcedure(...GIS_WRITE_ROLES)
        .input(
            z.object({
                id: EntityIdSchema,
                baseVersionId: z.string().min(1),
                branch: BranchSchema.default(MAIN_BRANCH),
                patch: StructurePatchSchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { patch } = input;
            try {
                return await ctx.db.transaction(async (tx) => {
                    const { previous, next } = await editVersioned(tx, structures, {
                        orgId: ctx.organizationId,
                        userId: ctx.session.userId,
                        id: input.id,
                        branch: input.branch,
                        baseVersionId: input.baseVersionId,
                        tombstone: false,
                        entity: "Structure",
                        patch: compact({
                            name: patch.name,
                            location: patch.location,
                            condition: patch.condition,
                            installedAt: patch.installedAt === undefined ? undefined : fromIso(patch.installedAt),
                            lastInspectedAt:
                                patch.lastInspectedAt === undefined ? undefined : fromIso(patch.lastInspectedAt),
                        }),
                    });

                    if (input.branch === MAIN_BRANCH) {
                        await syncAssetRegistry(tx, next.id, { label: next.name, location: next.location });
                        if (patch.condition !== undefined && patch.condition !== previous.condition) {
                            await emitConditionChanged(tx, {
                                orgId: ctx.organizationId,
                                assetId: next.id,
                                from: previous.condition,
                                to: next.condition,
                                userId: ctx.session.userId,
                            });
                        }
                    }
                    return toStructureDto(next);
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
                    await assertHousesNothing(tx, ctx.organizationId, input.branch, input.id);
                    await editVersioned(tx, structures, {
                        orgId: ctx.organizationId,
                        userId: ctx.session.userId,
                        id: input.id,
                        branch: input.branch,
                        baseVersionId: input.baseVersionId,
                        tombstone: true,
                        entity: "Structure",
                        patch: {},
                    });
                });
                return { ok: true as const };
            } catch (err) {
                rethrowDbError(err);
            }
        }),
});