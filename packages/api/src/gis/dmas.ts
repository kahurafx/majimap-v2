import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { assets, dmaBoundaryValves, dmas, nodes, tiers, type Database, type LatLng } from "@majimap/db";
import { isDegenerateRing, pointInRing } from "./geo";
import { loadNetwork } from "./network-view";
import { traceDirectional } from "@majimap/network";
import type { Dma } from "@majimap/shared-types";
import { gisProcedure, gisRoleProcedure, router } from "../trpc";
import {
    GIS_DELETE_ROLES,
    GIS_WRITE_ROLES,
    claimEntityId,
    editVersioned,
    listEffective,
    loadEffective,
    loadHistory,
    syncAssetRegistry,
    toHistoryEntry,
} from "./versioned";
import { BranchSchema, EntityIdSchema, GeoPointInput, MAIN_BRANCH, compact, rethrowDbError } from "./versioning";


type DmaRow = typeof dmas.$inferSelect;

/** The shape the frontends already consume (`Dma`), plus which version and branch this is. */
export type DmaDto = Dma & { versionId: string; branch: string };

export function toDmaDto(row: DmaRow, boundaryValveIds: readonly string[]): DmaDto {
    return {
        id: row.id,
        versionId: row.versionId,
        branch: row.branch,
        name: row.name,
        color: row.color,
        tierId: row.tierId,
        inletMeterId: row.inletMeterId,
        boundaryValveIds: [...boundaryValveIds],
        ring: row.boundary,
    };
}

/*
 * A DMA's boundary valves live in their own table, and each row belongs to ONE
 * VERSION of the DMA (dma_version_id), not to the DMA in the abstract. That's
 * what lets main and a branch hold different valve sets for the same DMA at
 * the same time. The consequence for every write: a new version of a DMA needs
 * its own full set of valve rows, copied from the version it replaces unless
 * the edit supplies a new set. Old versions keep theirs, as history.
 */

/** Each version's boundary valves, sorted so two equal sets always compare equal. */
export async function loadBoundaryValves(db: Database, versionIds: readonly string[]): Promise<Map<string, string[]>> {
    const byVersion = new Map<string, string[]>();
    if (versionIds.length === 0) return byVersion;
    const rows = await db
        .select({ versionId: dmaBoundaryValves.dmaVersionId, valveId: dmaBoundaryValves.valveAssetId })
        .from(dmaBoundaryValves)
        .where(inArray(dmaBoundaryValves.dmaVersionId, [...versionIds]));
    for (const row of rows) byVersion.set(row.versionId, [...(byVersion.get(row.versionId) ?? []), row.valveId]);
    for (const valves of byVersion.values()) valves.sort();
    return byVersion;
}

export async function writeBoundaryValves(db: Database, versionId: string, valveIds: readonly string[]) {
    const unique = [...new Set(valveIds)];
    if (unique.length === 0) return;
    await db.insert(dmaBoundaryValves).values(unique.map((valveAssetId) => ({ dmaVersionId: versionId, valveAssetId })));
}

/** Everything a DMA points at has to exist as the right thing, as the caller's branch sees it. */
async function assertDmaReferences(
    db: Database,
    args: {
        orgId: string;
        branch: string;
        tierId: string;
        inletMeterId: string;
        boundaryValveIds: readonly string[];
        ring: readonly LatLng[];
    },
) {
    const { orgId, branch, tierId, inletMeterId, boundaryValveIds, ring } = args;

    const [tier] = await db
        .select({ id: tiers.id })
        .from(tiers)
        .where(and(eq(tiers.id, tierId), eq(tiers.organizationId, orgId)))
        .limit(1);
    if (!tier) throw new TRPCError({ code: "BAD_REQUEST", message: "That tier doesn't exist in this organization" });

    const wanted = [...new Set([inletMeterId, ...boundaryValveIds])];
    const found = await listEffective(db, nodes, { orgId, branch, where: inArray(nodes.id, wanted) });
    const typeOf = new Map(found.map((n) => [n.id, n.type]));

    if (typeOf.get(inletMeterId) !== "meter") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A DMA's inlet must be an existing meter" });
    }
    for (const valveId of boundaryValveIds) {
        if (typeOf.get(valveId) !== "valve") {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Boundary valve ${valveId} must be an existing valve` });
        }
    }
    if (isDegenerateRing(ring)) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A DMA boundary needs at least three corners that enclose some area",
        });
    }
}

/**
 * A node can't be deleted while a DMA still uses it as its inlet meter or one
 * of its boundary valves — judged by what the caller's branch sees, so a DMA
 * already deleted or re-pointed on this branch doesn't block it. Called by
 * `nodes.delete`.
 */
export async function assertNodeNotUsedByDma(db: Database, orgId: string, branch: string, nodeId: string) {
    const inScope = and(eq(dmas.organizationId, orgId), eq(dmas.isHead, true), inArray(dmas.branch, [MAIN_BRANCH, branch]));

    const byInlet = await db
        .selectDistinct({ id: dmas.id })
        .from(dmas)
        .where(and(inScope, eq(dmas.inletMeterId, nodeId)));
    const byValve = await db
        .selectDistinct({ id: dmas.id })
        .from(dmas)
        .innerJoin(dmaBoundaryValves, eq(dmaBoundaryValves.dmaVersionId, dmas.versionId))
        .where(and(inScope, eq(dmaBoundaryValves.valveAssetId, nodeId)));

    const candidateIds = [...new Set([...byInlet, ...byValve].map((row) => row.id))];
    if (candidateIds.length === 0) return;

    const effective = await listEffective(db, dmas, { orgId, branch, where: inArray(dmas.id, candidateIds) });
    const valves = await loadBoundaryValves(db, effective.map((d) => d.versionId));
    const users = effective.filter(
        (dma) => dma.inletMeterId === nodeId || (valves.get(dma.versionId) ?? []).includes(nodeId),
    );
    if (users.length > 0) {
        const plural = users.length === 1;
        throw new TRPCError({
            code: "CONFLICT",
            message: `${users.length} DMA${plural ? " uses" : "s use"} this node as an inlet meter or boundary valve — update ${plural ? "it" : "them"} first`,
        });
    }
}

const NameInput = z.string().trim().min(1).max(200);
const ColorInput = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #3B82F6");
const RingInput = z.array(GeoPointInput).min(3).max(10_000);
const ValveIdsInput = z.array(EntityIdSchema).max(500);

const DmaPatchSchema = z
    .object({
        name: NameInput,
        color: ColorInput,
        tierId: z.string().min(1),
        inletMeterId: EntityIdSchema,
        boundaryValveIds: ValveIdsInput,
        ring: RingInput,
    })
    .partial()
    .refine((patch) => Object.values(patch).some((v) => v !== undefined), "Patch is empty");

export const dmasRouter = router({
    list: gisProcedure
        .input(z.object({ branch: BranchSchema.default(MAIN_BRANCH) }).optional())
        .query(async ({ ctx, input }) => {
            const rows = await listEffective(ctx.db, dmas, { orgId: ctx.organizationId, branch: input?.branch ?? MAIN_BRANCH });
            const valves = await loadBoundaryValves(ctx.db, rows.map((r) => r.versionId));
            return rows.map((row) => toDmaDto(row, valves.get(row.versionId) ?? []));
        }),

    byId: gisProcedure
        .input(z.object({ id: EntityIdSchema, branch: BranchSchema.default(MAIN_BRANCH) }))
        .query(async ({ ctx, input }) => {
            const row = await loadEffective(ctx.db, dmas, { orgId: ctx.organizationId, id: input.id, branch: input.branch });
            if (!row || row.isDeleted) throw new TRPCError({ code: "NOT_FOUND", message: "DMA not found" });
            const valves = await loadBoundaryValves(ctx.db, [row.versionId]);
            return toDmaDto(row, valves.get(row.versionId) ?? []);
        }),

    /** Every version, with the valve set each one had — so you can see who changed which valves, and when. */
    history: gisProcedure.input(z.object({ id: EntityIdSchema })).query(async ({ ctx, input }) => {
        const rows = await loadHistory(ctx.db, dmas, { orgId: ctx.organizationId, id: input.id });
        if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "DMA not found" });
        const valves = await loadBoundaryValves(ctx.db, rows.map((r) => r.versionId));
        return rows.map((row) => ({
            ...toHistoryEntry(row),
            name: row.name,
            inletMeterId: row.inletMeterId,
            boundaryValveIds: valves.get(row.versionId) ?? [],
        }));
    }),

    /**
     * Does what's CONNECTED to the DMA's inlet match what's DRAWN as its
     * boundary? Membership is traced downstream from the inlet meter — a DMA is
     * what its meter feeds, so tracing both ways would pull the entire upstream
     * supply network into every DMA — and compared against the polygon.
     *
     * - `outsideBoundary`: reached by the trace but not inside the polygon — the
     *   usual cause is a boundary valve that's open.
     * - `insideNotTraced`: inside the polygon but not fed from the inlet.
     * - `openBoundaryValveIds`: boundary valves that aren't closed (an unknown
     *   state counts as open: a valve nobody has confirmed shut isn't sealing anything).
     * - `sealed`: nothing escapes and nothing is open.
     */
    analysis: gisProcedure
        .input(z.object({ id: EntityIdSchema, branch: BranchSchema.default(MAIN_BRANCH) }))
        .query(async ({ ctx, input }) => {
            const dma = await loadEffective(ctx.db, dmas, { orgId: ctx.organizationId, id: input.id, branch: input.branch });
            if (!dma || dma.isDeleted) throw new TRPCError({ code: "NOT_FOUND", message: "DMA not found" });

            const valveIds = (await loadBoundaryValves(ctx.db, [dma.versionId])).get(dma.versionId) ?? [];
            const network = await loadNetwork(ctx.db, ctx.organizationId, input.branch);
            const nodeById = new Map(network.nodes.map((n) => [n.id, n]));
            if (!nodeById.has(dma.inletMeterId)) {
                throw new TRPCError({ code: "NOT_FOUND", message: "The DMA's inlet meter isn't part of the network in this view" });
            }

            const traced = traceDirectional(dma.inletMeterId, "downstream", network.nodes, network.pipes);
            const tracedIds = new Set(traced.map((n) => n.id));
            const insideIds = new Set(network.nodes.filter((n) => pointInRing(n.location, dma.boundary)).map((n) => n.id));

            const outsideBoundary = [...tracedIds].filter((id) => !insideIds.has(id)).sort();
            const insideNotTraced = [...insideIds].filter((id) => !tracedIds.has(id)).sort();
            const openBoundaryValveIds = valveIds.filter((id) => nodeById.get(id)?.isOpen !== false).sort();

            return {
                dmaId: dma.id,
                tracedNodeIds: [...tracedIds].sort(),
                outsideBoundary,
                insideNotTraced,
                openBoundaryValveIds,
                sealed: outsideBoundary.length === 0 && openBoundaryValveIds.length === 0,
            };
        }),

    create: gisRoleProcedure(...GIS_WRITE_ROLES)
        .input(
            z.object({
                id: EntityIdSchema.optional(),
                branch: BranchSchema.default(MAIN_BRANCH),
                name: NameInput,
                color: ColorInput,
                tierId: z.string().min(1),
                inletMeterId: EntityIdSchema,
                boundaryValveIds: ValveIdsInput.default([]),
                /** Corners in order; closed for you if the last doesn't repeat the first. */
                ring: RingInput,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const valveIds = [...new Set(input.boundaryValveIds)].sort();
            try {
                return await ctx.db.transaction(async (tx) => {
                    const id = input.id ?? createId();
                    const replay = await claimEntityId(tx, dmas, { orgId: ctx.organizationId, id, branch: input.branch });
                    if (replay) {
                        const existing = await loadBoundaryValves(tx, [replay.versionId]);
                        return toDmaDto(replay, existing.get(replay.versionId) ?? []);
                    }

                    await assertDmaReferences(tx, {
                        orgId: ctx.organizationId,
                        branch: input.branch,
                        tierId: input.tierId,
                        inletMeterId: input.inletMeterId,
                        boundaryValveIds: valveIds,
                        ring: input.ring,
                    });

                    await tx.insert(assets).values({
                        id,
                        organizationId: ctx.organizationId,
                        ownerModule: "gis",
                        label: input.name,
                        assetType: "dma",
                    });
                    const [row] = await tx
                        .insert(dmas)
                        .values({
                            id,
                            organizationId: ctx.organizationId,
                            branch: input.branch,
                            createdByUserId: ctx.session.userId,
                            name: input.name,
                            color: input.color,
                            tierId: input.tierId,
                            inletMeterId: input.inletMeterId,
                            boundary: input.ring,
                        })
                        .returning();
                    if (!row) throw new Error("Insert returned no row");
                    await writeBoundaryValves(tx, row.versionId, valveIds);
                    return toDmaDto(row, valveIds);
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
                patch: DmaPatchSchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { patch } = input;
            try {
                return await ctx.db.transaction(async (tx) => {
                    const { previous, next } = await editVersioned(tx, dmas, {
                        orgId: ctx.organizationId,
                        userId: ctx.session.userId,
                        id: input.id,
                        branch: input.branch,
                        baseVersionId: input.baseVersionId,
                        tombstone: false,
                        entity: "DMA",
                        patch: compact({
                            name: patch.name,
                            color: patch.color,
                            tierId: patch.tierId,
                            inletMeterId: patch.inletMeterId,
                            boundary: patch.ring,
                        }),
                    });

                    // The new version owns its own valve rows: the replacement set if one was given,
                    // otherwise a copy of the set on the version it replaces.
                    const previousValves = (await loadBoundaryValves(tx, [previous.versionId])).get(previous.versionId) ?? [];
                    const valveIds = patch.boundaryValveIds ? [...new Set(patch.boundaryValveIds)].sort() : previousValves;

                    await assertDmaReferences(tx, {
                        orgId: ctx.organizationId,
                        branch: input.branch,
                        tierId: next.tierId,
                        inletMeterId: next.inletMeterId,
                        boundaryValveIds: valveIds,
                        ring: next.boundary,
                    });
                    await writeBoundaryValves(tx, next.versionId, valveIds);

                    if (input.branch === MAIN_BRANCH) await syncAssetRegistry(tx, next.id, { label: next.name });
                    return toDmaDto(next, valveIds);
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
                    // A tombstone is a version with no valve rows: a deleted DMA has no boundary.
                    await editVersioned(tx, dmas, {
                        orgId: ctx.organizationId,
                        userId: ctx.session.userId,
                        id: input.id,
                        branch: input.branch,
                        baseVersionId: input.baseVersionId,
                        tombstone: true,
                        entity: "DMA",
                        patch: {},
                    });
                });
                return { ok: true as const };
            } catch (err) {
                rethrowDbError(err);
            }
        }),
});