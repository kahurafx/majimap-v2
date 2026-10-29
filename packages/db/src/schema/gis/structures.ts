import { index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationScopedColumns, versionedColumns } from "../core/columns";
import { pointColumn } from "../core/geometry";
import { gisSchema, structureTypeEnum, conditionEnum, nodeTypeEnum } from "./shared";

export const structures = gisSchema.table(
    "structures",
    {
        ...versionedColumns(),
        ...organizationScopedColumns(),
        type: structureTypeEnum("type").notNull(),
        name: text("name").notNull(),
        location: pointColumn("location").notNull(),
        condition: conditionEnum("condition").notNull().default("unknown"),
        installedAt: timestamp("installed_at", { withTimezone: true }),
        lastInspectedAt: timestamp("last_inspected_at", { withTimezone: true }),
    },
    (table) => [
        uniqueIndex("structures_head_unique").on(table.id, table.branch).where(sql`${table.isHead} = true`),
        index("structures_org_idx").on(table.organizationId),
    ],
);

/**
 * Requirement 6's allowed-pairs source of truth, checked by the trigger
 * in structure-attachment-trigger.sql. Seed this FROM shared-types'
 * STRUCTURE_ATTACHMENT_RULES (see seed/structure-attachment-rules.ts)
 * rather than retyping the pairs here — exactly the kind of duplicate
 * source of truth that's already caused drift twice in this project
 * (Zone/Dma, two separate condition-color palettes). The app-level
 * STRUCTURE_ATTACHMENT_RULES constant is a fast client-side pre-check for
 * the add-asset form; this table plus the trigger is the real enforcement.
 */
export const structureAttachmentRules = gisSchema.table(
    "structure_attachment_rules",
    {
        nodeType: nodeTypeEnum("node_type").notNull(),
        structureType: structureTypeEnum("structure_type").notNull(),
    },
    (table) => [uniqueIndex("attachment_rule_unique").on(table.nodeType, table.structureType)],
);