import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { nodes, subnetworks, tiers, type Database } from "@majimap/db";
import type { Subnetwork } from "@majimap/shared-types";
import { traceSubnetworkMembership } from "@majimap/network";
import { gisProcedure, gisRoleProcedure, router } from "../trpc";
import { loadNetwork, toNodeRef } from "./network-view";
import { listEffective } from "./versioned";
import { BranchSchema, EntityIdSchema, MAIN_BRANCH, compact, rethrowDbError, toIso } from "./versioning";

type SubnetworkRow = typeof subnetworks.$inferSelect;

export function toSubnetworkDto(row: SubnetworkRow): Subnetwork {
    return {
        id: row.id,
        name: row.name,
        tierId: row.tierId,
        controllerNodeId: row.controllerNodeId,
        lastValidatedAt: toIso(row.lastValidatedAt),
    };
}

const MANAGE_ROLES = ["admin", "gis_engineer"] as const;
const NameInput = z.string().trim().min(1).max(200);

/**
 * What can anchor a subnetwork: something that supplies water or can shut it
 * off. A junction or a hydrant is just somewhere water passes.
 */
const CONTROLLER_TYPES: readonly string[] = ["reservoir", "pumping_station", "valve", "meter"];

/*
 * Subnetworks aren't versioned (they're administrative configuration, not
 * field edits), so they exist on main only — and a controller has to be a node
 * that's live on MAIN, not one that merely exists on someone's branch.
 */
async function assertController(db: Database, orgId: string, nodeId: string) {
    const [node] = await listEffective(db, nodes, { orgId, branch: MAIN_BRANCH, where: inArray(nodes.id, [nodeId]) });
    if (!node) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The controller must be an existing node on main" });
    }
    if (!CONTROLLER_TYPES.includes(node.type)) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: `A ${node.type.replace("_", " ")} can't control a subnetwork — use a reservoir, pumping station, valve or meter`,
        });
    }
}

async function assertTier(db: Database, orgId: string, tierId: string) {
    const [tier] = await db
        .select({ id: tiers.id })
        .from(tiers)
        .where(and(eq(tiers.id, tierId), eq(tiers.organizationId, orgId)))
        .limit(1);
    if (!tier) throw new TRPCError({ code: "BAD_REQUEST", message: "That tier doesn't exist in this organization" });
}

/**
 * A node can't be deleted while it controls a subnetwork. Subnetworks live on
 * main only, so this applies on every branch: even deleting it on a branch
 * would leave the subnetwork pointing at nothing once that branch is posted.
 * Called by `nodes.delete`.
 */
export async function assertNodeNotController(db: Database, orgId: string, nodeId: string) {
    const controlled = await db
        .select({ id: subnetworks.id })
        .from(subnetworks)
        .where(and(eq(subnetworks.organizationId, orgId), eq(subnetworks.controllerNodeId, nodeId)));
    if (controlled.length > 0) {
        const plural = controlled.length === 1;
        throw new TRPCError({
            code: "CONFLICT",
            message: `This node controls ${controlled.length} subnetwork${plural ? "" : "s"} — reassign ${plural ? "it" : "them"} first`,
        });
    }
}

async function loadSubnetwork(db: Database, orgId: string, id: string): Promise<SubnetworkRow> {
    const [row] = await db
        .select()
        .from(subnetworks)
        .where(and(eq(subnetworks.id, id), eq(subnetworks.organizationId, orgId)))
        .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Subnetwork not found" });
    return row;
}

export const subnetworksRouter = router({
    list: gisProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(subnetworks)
            .where(eq(subnetworks.organizationId, ctx.organizationId))
            .orderBy(asc(subnetworks.name));
        return rows.map(toSubnetworkDto);
    }),

    byId: gisProcedure.input(z.object({ id: EntityIdSchema })).query(async ({ ctx, input }) => {
        return toSubnetworkDto(await loadSubnetwork(ctx.db, ctx.organizationId, input.id));
    }),

    create: gisRoleProcedure(...MANAGE_ROLES)
        .input(z.object({ name: NameInput, tierId: z.string().min(1), controllerNodeId: EntityIdSchema }))
        .mutation(async ({ ctx, input }) => {
            try {
                await assertTier(ctx.db, ctx.organizationId, input.tierId);
                await assertController(ctx.db, ctx.organizationId, input.controllerNodeId);
                const [row] = await ctx.db
                    .insert(subnetworks)
                    .values({
                        organizationId: ctx.organizationId,
                        name: input.name,
                        tierId: input.tierId,
                        controllerNodeId: input.controllerNodeId,
                    })
                    .returning();
                if (!row) throw new Error("Insert returned no row");
                return toSubnetworkDto(row);
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    /**
     * Re-pointing a subnetwork (a new controller or a new tier) means whatever
     * was validated no longer describes it, so the validation is cleared.
     * Renaming doesn't change what it contains and leaves it alone.
     */
    update: gisRoleProcedure(...MANAGE_ROLES)
        .input(
            z.object({
                id: EntityIdSchema,
                patch: z
                    .object({ name: NameInput, tierId: z.string().min(1), controllerNodeId: EntityIdSchema })
                    .partial()
                    .refine((patch) => Object.values(patch).some((v) => v !== undefined), "Patch is empty"),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { patch } = input;
            try {
                const existing = await loadSubnetwork(ctx.db, ctx.organizationId, input.id);
                if (patch.tierId !== undefined) await assertTier(ctx.db, ctx.organizationId, patch.tierId);
                if (patch.controllerNodeId !== undefined) await assertController(ctx.db, ctx.organizationId, patch.controllerNodeId);

                const repointed =
                    (patch.tierId !== undefined && patch.tierId !== existing.tierId) ||
                    (patch.controllerNodeId !== undefined && patch.controllerNodeId !== existing.controllerNodeId);

                const [row] = await ctx.db
                    .update(subnetworks)
                    .set({
                        ...compact({ name: patch.name, tierId: patch.tierId, controllerNodeId: patch.controllerNodeId }),
                        ...(repointed ? { lastValidatedAt: null } : {}),
                    })
                    .where(and(eq(subnetworks.id, input.id), eq(subnetworks.organizationId, ctx.organizationId)))
                    .returning();
                if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Subnetwork not found" });
                return toSubnetworkDto(row);
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    delete: gisRoleProcedure(...MANAGE_ROLES)
        .input(z.object({ id: EntityIdSchema }))
        .mutation(async ({ ctx, input }) => {
            await loadSubnetwork(ctx.db, ctx.organizationId, input.id);
            await ctx.db
                .delete(subnetworks)
                .where(and(eq(subnetworks.id, input.id), eq(subnetworks.organizationId, ctx.organizationId)));
            return { ok: true as const };
        }),

    /**
     * Everything reachable from the controller without passing a closed valve,
     * as the given branch sees the network.
     */
    members: gisProcedure
        .input(z.object({ id: EntityIdSchema, branch: BranchSchema.default(MAIN_BRANCH) }))
        .query(async ({ ctx, input }) => {
            const subnetwork = await loadSubnetwork(ctx.db, ctx.organizationId, input.id);
            const network = await loadNetwork(ctx.db, ctx.organizationId, input.branch);
            if (!network.nodes.some((n) => n.id === subnetwork.controllerNodeId)) {
                throw new TRPCError({ code: "NOT_FOUND", message: "The controller isn't part of the network in this view" });
            }
            const members = traceSubnetworkMembership(subnetwork.controllerNodeId, network.nodes, network.pipes);
            return { subnetwork: toSubnetworkDto(subnetwork), members: members.map(toNodeRef) };
        }),

    /**
     * Recompute the membership on main and stamp the subnetwork as validated.
     * What it checks today: the controller is still a live controller-capable
     * node. What it reports without blocking: other subnetworks in the same
     * tier that share nodes with this one — an overlap is often the very thing
     * the operator wants to look at, not something to refuse. It does NOT yet
     * notice that the network has changed since the last validation (that
     * needs "dirty area" tracking), so a stamp means "checked then", not
     * "still true now".
     */
    validate: gisRoleProcedure(...MANAGE_ROLES)
        .input(z.object({ id: EntityIdSchema }))
        .mutation(async ({ ctx, input }) => {
            const subnetwork = await loadSubnetwork(ctx.db, ctx.organizationId, input.id);
            await assertController(ctx.db, ctx.organizationId, subnetwork.controllerNodeId);

            const network = await loadNetwork(ctx.db, ctx.organizationId, MAIN_BRANCH);
            const members = new Set(
                traceSubnetworkMembership(subnetwork.controllerNodeId, network.nodes, network.pipes).map((n) => n.id),
            );

            const siblings = await ctx.db
                .select()
                .from(subnetworks)
                .where(
                    and(
                        eq(subnetworks.organizationId, ctx.organizationId),
                        eq(subnetworks.tierId, subnetwork.tierId),
                    ),
                );
            const overlaps = siblings
                .filter((other) => other.id !== subnetwork.id)
                .map((other) => {
                    const theirs = traceSubnetworkMembership(other.controllerNodeId, network.nodes, network.pipes);
                    return { subnetworkId: other.id, name: other.name, sharedNodes: theirs.filter((n) => members.has(n.id)).length };
                })
                .filter((overlap) => overlap.sharedNodes > 0);

            const [row] = await ctx.db
                .update(subnetworks)
                .set({ lastValidatedAt: new Date() })
                .where(and(eq(subnetworks.id, input.id), eq(subnetworks.organizationId, ctx.organizationId)))
                .returning();
            if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Subnetwork not found" });
            return { subnetwork: toSubnetworkDto(row), memberCount: members.size, overlaps };
        }),
});