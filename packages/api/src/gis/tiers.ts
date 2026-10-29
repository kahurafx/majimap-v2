import { TRPCError } from "@trpc/server";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { dmas, subnetworks, tiers, type Database } from "@majimap/db";
import type { Tier } from "@majimap/shared-types";
import { gisProcedure, gisRoleProcedure, router } from "../trpc";
import { EntityIdSchema, compact, rethrowDbError } from "./versioning";

type TierRow = typeof tiers.$inferSelect;

export function toTierDto(row: TierRow): Tier {
    return { id: row.id, name: row.name, order: row.order };
}

/** Tiers are configuration, not field data: only people who manage the network can change them. */
const MANAGE_ROLES = ["admin", "gis_engineer"] as const;

const NameInput = z.string().trim().min(1).max(100);
/** 1 is the top of the hierarchy (transmission); higher numbers sit further down. */
const OrderInput = z.number().int().min(1).max(100);

async function assertOrderFree(db: Database, orgId: string, order: number, exceptId?: string) {
    const [clash] = await db
        .select({ id: tiers.id, name: tiers.name })
        .from(tiers)
        .where(
            and(eq(tiers.organizationId, orgId), eq(tiers.order, order), exceptId ? ne(tiers.id, exceptId) : undefined),
        )
        .limit(1);
    if (clash) {
        throw new TRPCError({ code: "CONFLICT", message: `The tier "${clash.name}" already uses order ${order}` });
    }
}

export const tiersRouter = router({
    /** Top of the hierarchy first. */
    list: gisProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(tiers)
            .where(eq(tiers.organizationId, ctx.organizationId))
            .orderBy(asc(tiers.order));
        return rows.map(toTierDto);
    }),

    create: gisRoleProcedure(...MANAGE_ROLES)
        .input(z.object({ name: NameInput, order: OrderInput }))
        .mutation(async ({ ctx, input }) => {
            try {
                await assertOrderFree(ctx.db, ctx.organizationId, input.order);
                const [row] = await ctx.db
                    .insert(tiers)
                    .values({ organizationId: ctx.organizationId, name: input.name, order: input.order })
                    .returning();
                if (!row) throw new Error("Insert returned no row");
                return toTierDto(row);
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    update: gisRoleProcedure(...MANAGE_ROLES)
        .input(
            z.object({
                id: EntityIdSchema,
                patch: z
                    .object({ name: NameInput, order: OrderInput })
                    .partial()
                    .refine((patch) => Object.values(patch).some((v) => v !== undefined), "Patch is empty"),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            try {
                const [existing] = await ctx.db
                    .select({ id: tiers.id })
                    .from(tiers)
                    .where(and(eq(tiers.id, input.id), eq(tiers.organizationId, ctx.organizationId)))
                    .limit(1);
                if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Tier not found" });
                if (input.patch.order !== undefined) {
                    await assertOrderFree(ctx.db, ctx.organizationId, input.patch.order, input.id);
                }

                const [row] = await ctx.db
                    .update(tiers)
                    .set(compact({ name: input.patch.name, order: input.patch.order }))
                    .where(and(eq(tiers.id, input.id), eq(tiers.organizationId, ctx.organizationId)))
                    .returning();
                if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tier not found" });
                return toTierDto(row);
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    /**
     * A tier that anything has ever pointed at can't be deleted — only renamed
     * or re-ordered. Live subnetworks and DMAs would be left dangling, and DMA
     * versions are history that has to stay readable, so even a tier only old
     * versions mention has to stay.
     */
    delete: gisRoleProcedure(...MANAGE_ROLES)
        .input(z.object({ id: EntityIdSchema }))
        .mutation(async ({ ctx, input }) => {
            try {
                const [existing] = await ctx.db
                    .select({ id: tiers.id })
                    .from(tiers)
                    .where(and(eq(tiers.id, input.id), eq(tiers.organizationId, ctx.organizationId)))
                    .limit(1);
                if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Tier not found" });

                const usingSubnetworks = await ctx.db
                    .select({ id: subnetworks.id })
                    .from(subnetworks)
                    .where(and(eq(subnetworks.tierId, input.id), eq(subnetworks.organizationId, ctx.organizationId)));
                if (usingSubnetworks.length > 0) {
                    const plural = usingSubnetworks.length === 1;
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: `${usingSubnetworks.length} subnetwork${plural ? " uses" : "s use"} this tier — move ${plural ? "it" : "them"} first`,
                    });
                }

                const usingDmas = await ctx.db
                    .select({ isHead: dmas.isHead, isDeleted: dmas.isDeleted })
                    .from(dmas)
                    .where(and(eq(dmas.tierId, input.id), eq(dmas.organizationId, ctx.organizationId)));
                const live = usingDmas.filter((d) => d.isHead && !d.isDeleted).length;
                if (live > 0) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: `${live} DMA${live === 1 ? " uses" : "s use"} this tier — move ${live === 1 ? "it" : "them"} first`,
                    });
                }
                if (usingDmas.length > 0) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: "Past versions of DMAs refer to this tier, so it can't be deleted — rename it instead",
                    });
                }

                await ctx.db.delete(tiers).where(and(eq(tiers.id, input.id), eq(tiers.organizationId, ctx.organizationId)));
                return { ok: true as const };
            } catch (err) {
                rethrowDbError(err);
            }
        }),
});