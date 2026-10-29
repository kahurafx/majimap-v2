import { nodes, pipes, type Database } from "@majimap/db";
import { listEffective } from "./versioned";

export type NodeRow = typeof nodes.$inferSelect;
export type PipeRow = typeof pipes.$inferSelect;

/**
 * What a trace result says about a node: enough to list it or find it on the
 * map. Callers that want the full record already hold it, or can fetch it with
 * `nodes.byId` — and keeping results this small is also what lets the analysis
 * code stay independent of the node router.
 */
export type NodeRef = { id: string; name: string; type: NodeRow["type"] };

export const toNodeRef = (row: NodeRow): NodeRef => ({ id: row.id, name: row.name, type: row.type });

/**
 * The network as a branch sees it: every live node and pipe, with the branch's
 * edits laid over main's. Rows satisfy the trace algorithms' minimal node and
 * pipe shapes directly, so nothing is converted on the way in.
 *
 * Loads the whole network per call. That's fine at the size this is built for
 * and wrong for a very large one — at that point membership wants a recursive
 * query in the database instead — but it keeps the answer identical to what
 * the client-side traces compute, which is worth having first.
 */
export async function loadNetwork(db: Database, orgId: string, branch: string) {
    const [nodeRows, pipeRows] = await Promise.all([
        listEffective(db, nodes, { orgId, branch }),
        listEffective(db, pipes, { orgId, branch }),
    ]);
    return { nodes: nodeRows, pipes: pipeRows };
}