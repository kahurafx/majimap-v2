import { buildAdjacency, indexNodes, pickNodes } from "./graph";
import { isClosedValve, isSource, type TraceNode, type TracePipe } from "./types";

export type IsolationTraceResult<N extends TraceNode = TraceNode> = {
    /** Everything that loses supply: the failed pipe's own ends, plus whatever they reach before a valve. */
    affectedNodes: N[];
    /** Open valves bounding the affected area — what an operator has to close. */
    valvesToClose: N[];
    /** Valves bounding the area that are already closed; they isolate it with no action needed. */
    alreadyClosed: N[];
    /**
     * Supply sources (reservoirs, pumping stations) connected to the break with
     * no valve in between. If this isn't empty the break can't be isolated from
     * supply by closing valves — the source itself would have to be shut.
     */
    unisolatedSources: N[];
};

/**
 * From a failed pipe, flood outward both ways, stopping at the first valve on
 * each path. Open valves are what to close; closed ones already isolate.
 *
 * `skipValveIds` is "that valve won't operate — route around it": a skipped
 * open valve is traced straight through, so the trace continues to the next
 * valve beyond it. A closed valve stops the trace regardless of being skipped,
 * since it isn't relying on being operated.
 *
 * What this does not do: find customers who lose supply only because they're
 * downstream of the isolated area through a dead-end branch. Everything the
 * trace can reach is in `affectedNodes`; a second-order "who else goes dry"
 * analysis needs flow direction, which needs the hydraulic solver.
 */
export function traceIsolation<N extends TraceNode>(
    failedPipeId: string,
    nodes: readonly N[],
    pipes: readonly TracePipe[],
    skipValveIds: readonly string[] = [],
): IsolationTraceResult<N> {
    const pipe = pipes.find((p) => p.id === failedPipeId);
    if (!pipe) return { affectedNodes: [], valvesToClose: [], alreadyClosed: [], unisolatedSources: [] };

    const byId = indexNodes(nodes);
    const adjacency = buildAdjacency(pipes);
    const skipped = new Set(skipValveIds);

    const visited = new Set<string>([pipe.fromNodeId, pipe.toNodeId]);
    const valvesToClose = new Set<string>();
    const alreadyClosed = new Set<string>();
    const queue: string[] = [...visited];

    for (let head = 0; head < queue.length; head++) {
        const currentId = queue[head];
        if (currentId === undefined) continue;
        const current = byId.get(currentId);

        if (current?.type === "valve") {
            if (isClosedValve(current)) {
                alreadyClosed.add(currentId);
                continue;
            }
            if (!skipped.has(currentId)) {
                valvesToClose.add(currentId);
                continue;
            }
        }

        for (const neighborId of adjacency.get(currentId) ?? []) {
            if (visited.has(neighborId)) continue;
            visited.add(neighborId);
            queue.push(neighborId);
        }
    }

    const inside = [...visited].filter((id) => !valvesToClose.has(id) && !alreadyClosed.has(id));
    return {
        affectedNodes: pickNodes(inside, byId),
        valvesToClose: pickNodes(valvesToClose, byId),
        alreadyClosed: pickNodes(alreadyClosed, byId),
        unisolatedSources: pickNodes(
            inside.filter((id) => isSource(byId.get(id))),
            byId,
        ),
    };
}