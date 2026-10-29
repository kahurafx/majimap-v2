import type { TraceNode, TracePipe } from "./types";

export type Adjacency = Map<string, string[]>;

/** Undirected: a pipe connects its two ends both ways. */
export function buildAdjacency(pipes: readonly TracePipe[]): Adjacency {
    const adjacency: Adjacency = new Map();
    const link = (from: string, to: string) => {
        const neighbors = adjacency.get(from);
        if (neighbors) neighbors.push(to);
        else adjacency.set(from, [to]);
    };
    for (const pipe of pipes) {
        link(pipe.fromNodeId, pipe.toNodeId);
        link(pipe.toNodeId, pipe.fromNodeId);
    }
    return adjacency;
}

export function indexNodes<N extends TraceNode>(nodes: readonly N[]): Map<string, N> {
    return new Map(nodes.map((node): [string, N] => [node.id, node]));
}

/** Look ids up in an index, silently dropping any that aren't there (a pipe can reference a node that wasn't loaded). */
export function pickNodes<N>(ids: Iterable<string>, byId: ReadonlyMap<string, N>): N[] {
    const picked: N[] = [];
    for (const id of ids) {
        const node = byId.get(id);
        if (node) picked.push(node);
    }
    return picked;
}