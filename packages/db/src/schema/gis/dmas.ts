import { index, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { organizationScopedColumns, versionedColumns } from "../core/columns";
import { polygonColumn } from "../core/geometry";
import { assets } from "../core/assets";
import { gisSchema } from "./shared";
import { tiers } from "./tiers";

export const dmas = gisSchema.table(
    "dmas",
    {
        ...versionedColumns(),
        ...organizationScopedColumns(),
        name: text("name").notNull(),
        color: text("color").notNull(),
        tierId: text("tier_id").notNull().references(() => tiers.id),
        // The entity's stable identity, not a specific meter version —
        // same pattern as nodes.structureId.
        inletMeterId: text("inlet_meter_id").notNull().references(() => assets.id),
        boundary: polygonColumn("boundary").notNull(),
    },
    (table) => [
        uniqueIndex("dmas_head_unique").on(table.id, table.branch).where(sql`${table.isHead} = true`),
        index("dmas_org_idx").on(table.organizationId),
    ],
);

/**
 * Boundary valves are a property of ONE SPECIFIC EDIT of a DMA, not of
 * the DMA in the abstract — unlike inletMeterId above, this references
 * dmas.versionId (a real primary key) rather than dmas.id. That's what
 * lets a DMA have a genuinely different boundary-valve set on a
 * feature branch than on main at the same time without ambiguity: each
 * version row owns its own independent set of these rows. Editing a
 * DMA's boundary valves means inserting a new dmas version AND a fresh
 * set of these rows together, in one transaction — never updating the
 * old version's rows in place.
 */
export const dmaBoundaryValves = gisSchema.table(
    "dma_boundary_valves",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        dmaVersionId: text("dma_version_id").notNull().references(() => dmas.versionId, { onDelete: "cascade" }),
        valveAssetId: text("valve_asset_id").notNull().references(() => assets.id),
    },
    (table) => [
        index("dma_boundary_valves_version_idx").on(table.dmaVersionId),
        uniqueIndex("dma_boundary_valve_unique").on(table.dmaVersionId, table.valveAssetId),
    ],
);