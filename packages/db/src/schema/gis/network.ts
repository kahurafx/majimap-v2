import { boolean, check, index, integer, real, timestamp, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationScopedColumns, versionedColumns } from "../core/columns";
import { pointColumn, lineStringColumn } from "../core/geometry";
import { assets } from "../core/assets";
import { gisSchema, nodeTypeEnum, conditionEnum, junctionTypeEnum, pipeMaterialEnum } from "./shared";

export const nodes = gisSchema.table(
    "nodes",
    {
        ...versionedColumns(),
        ...organizationScopedColumns(),
        type: nodeTypeEnum("type").notNull(),
        name: text("name").notNull(),
        location: pointColumn("location").notNull(),
        condition: conditionEnum("condition").notNull().default("unknown"),
        isOpen: boolean("is_open"),
        // References the structure's stable identity (core.assets.id), not
        // a specific structure version — "housed in whichever version of
        // that vault is currently head."
        structureId: text("structure_id").references(() => assets.id),
        installedAt: timestamp("installed_at", { withTimezone: true }),
        lastInspectedAt: timestamp("last_inspected_at", { withTimezone: true }),

        // Junction details. All three are NULL for anything that isn't a junction, and for a junction
        // nobody has recorded yet. Type and main size always come together.
        junctionType: junctionTypeEnum("junction_type"),
        mainSizeMm: integer("main_size_mm"),
        branchSizeMm: integer("branch_size_mm"),
    },
    (table) => [
        uniqueIndex("nodes_head_unique").on(table.id, table.branch).where(sql`${table.isHead} = true`),
        index("nodes_org_idx").on(table.organizationId),
        index("nodes_structure_idx").on(table.structureId),
        check(
            "nodes_junction_fields",
            sql`(${table.type} = 'junction' or (${table.junctionType} is null and ${table.mainSizeMm} is null and ${table.branchSizeMm} is null))
                and ((${table.junctionType} is null) = (${table.mainSizeMm} is null))
                and (${table.mainSizeMm} is null or ${table.mainSizeMm} > 0)
                and (${table.branchSizeMm} is null or (${table.mainSizeMm} is not null and ${table.branchSizeMm} < ${table.mainSizeMm}))
                and (${table.junctionType} is distinct from 'reducer' or ${table.branchSizeMm} is not null)`,
        ),
    ],
);

export const pipes = gisSchema.table(
    "pipes",
    {
        ...versionedColumns(),
        ...organizationScopedColumns(),
        fromNodeId: text("from_node_id").notNull().references(() => assets.id),
        toNodeId: text("to_node_id").notNull().references(() => assets.id),
        path: lineStringColumn("path").notNull(),
        material: pipeMaterialEnum("material").notNull().default("unknown"),
        diameterMm: real("diameter_mm").notNull(),
        condition: conditionEnum("condition").notNull().default("unknown"),
        lengthM: real("length_m").notNull(),
    },
    (table) => [
        uniqueIndex("pipes_head_unique").on(table.id, table.branch).where(sql`${table.isHead} = true`),
        index("pipes_org_idx").on(table.organizationId),
        index("pipes_from_idx").on(table.fromNodeId),
        index("pipes_to_idx").on(table.toNodeId),
    ],
);