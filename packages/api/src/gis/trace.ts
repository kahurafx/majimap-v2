import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { traceDirectional, traceIsolation } from "@majimap/network";
import { gisProcedure, router } from "../trpc";
import { loadNetwork, toNodeRef } from "./network-view";
import { BranchSchema, EntityIdSchema, MAIN_BRANCH } from "./versioning";

/**
 * Network traces against the stored network — the same algorithms the clients
 * run on their own cached copy (they're one shared package), so what the
 * server says and what a phone says offline can't drift apart. Results are
 * references, not full records: callers that want a node's details already
 * hold it or can fetch it by id.
 *
 * Upstream/downstream is still hop distance from the nearest source, not real
 * flow direction, until there's a hydraulic solver to say otherwise.
 */
export const traceRouter = router({
    directional: gisProcedure
        .input(
            z.object({
                startNodeId: EntityIdSchema,
                direction: z.enum(["upstream", "downstream"]),
                branch: BranchSchema.default(MAIN_BRANCH),
            }),
        )
        .query(async ({ ctx, input }) => {
            const network = await loadNetwork(ctx.db, ctx.organizationId, input.branch);
            if (!network.nodes.some((n) => n.id === input.startNodeId)) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Node not found" });
            }
            const reached = traceDirectional(input.startNodeId, input.direction, network.nodes, network.pipes);
            return { nodes: reached.map(toNodeRef) };
        }),

    /**
     * What a break on this pipe cuts off, and what an operator has to do about
     * it. `skipValveIds` is "that valve won't operate — route around it".
     */
    isolation: gisProcedure
        .input(
            z.object({
                failedPipeId: EntityIdSchema,
                skipValveIds: z.array(EntityIdSchema).max(500).default([]),
                branch: BranchSchema.default(MAIN_BRANCH),
            }),
        )
        .query(async ({ ctx, input }) => {
            const network = await loadNetwork(ctx.db, ctx.organizationId, input.branch);
            if (!network.pipes.some((p) => p.id === input.failedPipeId)) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Pipe not found" });
            }
            const result = traceIsolation(input.failedPipeId, network.nodes, network.pipes, input.skipValveIds);
            return {
                affectedNodes: result.affectedNodes.map(toNodeRef),
                valvesToClose: result.valvesToClose.map(toNodeRef),
                alreadyClosed: result.alreadyClosed.map(toNodeRef),
                unisolatedSources: result.unisolatedSources.map(toNodeRef),
            };
        }),
});