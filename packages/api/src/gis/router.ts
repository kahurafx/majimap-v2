import { router } from "../trpc";
import { dmasRouter } from "./dmas";
import { logsRouter } from "./logs";
import { nodesRouter } from "./nodes";
import { pipesRouter } from "./pipes";
import { reconcileRouter } from "./reconcile";
import { structuresRouter } from "./structures";
import { subnetworksRouter } from "./subnetworks";
import { tiersRouter } from "./tiers";
import { traceRouter } from "./trace";

export const gisRouter = router({
    nodes: nodesRouter,
    structures: structuresRouter,
    pipes: pipesRouter,
    dmas: dmasRouter,
    tiers: tiersRouter,
    subnetworks: subnetworksRouter,
    trace: traceRouter,
    logs: logsRouter,
    reconcile: reconcileRouter,
});