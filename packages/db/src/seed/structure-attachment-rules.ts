import { STRUCTURE_ATTACHMENT_RULES, type NodeType, type StructureType } from "@majimap/shared-types";
import type { Database } from "../client";
import { structureAttachmentRules } from "../schema";

/** Idempotent — safe to re-run after the rules in shared-types change. */
export async function seedStructureAttachmentRules(db: Database) {
    const rows = (Object.entries(STRUCTURE_ATTACHMENT_RULES) as [NodeType, StructureType[]][]).flatMap(
        ([nodeType, structureTypes]) => structureTypes.map((structureType) => ({ nodeType, structureType })),
    );
    if (rows.length === 0) return;
    await db.insert(structureAttachmentRules).values(rows).onConflictDoNothing();
}