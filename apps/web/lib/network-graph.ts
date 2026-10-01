import type { NetworkNode, Pipe } from "@majimap/shared-types";

function buildAdjacency(pipes: Pipe[]): Map<string, string[]> {
    const adjacency = new Map<string, string[]>();
    for (const pipe of pipes) {
        if (!adjacency.has(pipe.fromNodeId)) adjacency.set(pipe.fromNodeId, []);
        if (!adjacency.has(pipe.toNodeId)) adjacency.set(pipe.toNodeId, []);
        adjacency.get(pipe.fromNodeId)!.push(pipe.toNodeId);
        adjacency.get(pipe.toNodeId)!.push(pipe.fromNodeId);
    }
    return adjacency;
}

/**
 * Undirected connectivity trace from a controller node, stopping
 * propagation through (but still including) any closed valve. Stands in
 * for the real topological trace service until that exists.
 */
export function traceSubnetworkMembership(
    controllerId: string,
    nodes: NetworkNode[],
    pipes: Pipe[],
): NetworkNode[] {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const adjacency = buildAdjacency(pipes);

    const visited = new Set<string>([controllerId]);
    const queue = [controllerId];

    while (queue.length) {
        const currentId = queue.shift()!;
        const current = nodeById.get(currentId);
        const isClosedValve = current?.type === "valve" && current.isOpen === false;
        if (isClosedValve && currentId !== controllerId) continue;

        for (const neighborId of adjacency.get(currentId) ?? []) {
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                queue.push(neighborId);
            }
        }
    }

    return [...visited].map((id) => nodeById.get(id)!).filter(Boolean);
}

function computeDistanceFromSource(nodes: NetworkNode[], adjacency: Map<string, string[]>): Map<string, number> {
    const distances = new Map<string, number>();
    const queue: string[] = [];
    for (const n of nodes) {
        if (n.type === "reservoir" || n.type === "pumping_station") {
            distances.set(n.id, 0);
            queue.push(n.id);
        }
    }
    while (queue.length) {
        const current = queue.shift()!;
        const d = distances.get(current)!;
        for (const neighbor of adjacency.get(current) ?? []) {
            if (!distances.has(neighbor)) {
                distances.set(neighbor, d + 1);
                queue.push(neighbor);
            }
        }
    }
    return distances;
}

/**
 * Upstream/downstream trace, approximated by hop-distance to the nearest
 * source (reservoir or pumping station) rather than true flow direction —
 * there's no hydraulic simulation to derive real direction from. In a
 * looped network this can disagree with reality near pressure-balanced
 * points. Stand-in until the solver exists, not the final answer.
 */
export function traceDirectional(
    startNodeId: string,
    direction: "upstream" | "downstream",
    nodes: NetworkNode[],
    pipes: Pipe[],
): NetworkNode[] {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const adjacency = buildAdjacency(pipes);
    const distances = computeDistanceFromSource(nodes, adjacency);

    const visited = new Set<string>([startNodeId]);
    const queue = [startNodeId];

    while (queue.length) {
        const currentId = queue.shift()!;
        const current = nodeById.get(currentId);
        if (current?.type === "valve" && current.isOpen === false && currentId !== startNodeId) continue;

        const currentDistance = distances.get(currentId) ?? 0;
        for (const neighborId of adjacency.get(currentId) ?? []) {
            if (visited.has(neighborId)) continue;
            const neighborDistance = distances.get(neighborId) ?? 0;
            const movesTowardSource = neighborDistance < currentDistance;
            const isCorrectDirection = direction === "upstream" ? movesTowardSource : !movesTowardSource;
            if (isCorrectDirection) {
                visited.add(neighborId);
                queue.push(neighborId);
            }
        }
    }

    return [...visited].map((id) => nodeById.get(id)!).filter(Boolean);
}

export type IsolationTraceResult = {
    affectedNodes: NetworkNode[];
    valvesToClose: NetworkNode[];
    /**
     * Branches that dead-ended (reached a leaf, non-valve node) before ever
     * reaching a valve. Approximated via node degree, not true per-branch
     * path tracking — enough to flag "this side of the break can't actually
     * be isolated," not a precise count of distinct branches.
     */
    deadEnds: number;
};

/**
 * From a failed pipe, floods outward in both directions, stopping at (and
 * recording, not crossing) the first valve on each path — those are the
 * valves an operator would close. Pass previously-tried valve ids in
 * `skipValveIds` for "that valve won't operate, route around it" and
 * re-run.
 */
export function traceIsolation(
    failedPipeId: string,
    nodes: NetworkNode[],
    pipes: Pipe[],
    skipValveIds: string[] = [],
): IsolationTraceResult {
    const pipe = pipes.find((p) => p.id === failedPipeId);
    if (!pipe) return { affectedNodes: [], valvesToClose: [], deadEnds: 0 };

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const adjacency = buildAdjacency(pipes);

    const visited = new Set<string>([pipe.fromNodeId, pipe.toNodeId]);
    const valvesToClose = new Set<string>();
    const queue = [pipe.fromNodeId, pipe.toNodeId];

    while (queue.length) {
        const currentId = queue.shift()!;
        const current = nodeById.get(currentId);
        const isStoppingValve = current?.type === "valve" && !skipValveIds.includes(currentId);
        if (isStoppingValve) {
            valvesToClose.add(currentId);
            continue;
        }
        for (const neighborId of adjacency.get(currentId) ?? []) {
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                queue.push(neighborId);
            }
        }
    }

    const deadEnds = [...visited].filter((id) => {
        const node = nodeById.get(id);
        const degree = (adjacency.get(id) ?? []).length;
        return node && node.type !== "valve" && degree <= 1 && id !== pipe.fromNodeId && id !== pipe.toNodeId;
    }).length;

    const affectedNodes = [...visited]
        .filter((id) => !valvesToClose.has(id))
        .map((id) => nodeById.get(id)!)
        .filter(Boolean);

    return {
        affectedNodes,
        valvesToClose: [...valvesToClose].map((id) => nodeById.get(id)!).filter(Boolean),
        deadEnds,
    };
}