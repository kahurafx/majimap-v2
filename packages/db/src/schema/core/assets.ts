import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { organizationScopedColumns } from "./columns";
import { pointColumn } from "./geometry";
import { MODULE_KEYS } from "./modules";

/**
 * The generic, cross-module asset registry — not versioned. GIS's own
 * `nodes`/`pipes` tables (next turn) hold the real detail (condition,
 * hydraulic properties, history) and are versioned; this table is just a
 * thin, mostly-stable pointer so Inventory or Work Orders can reference
 * "that valve" without knowing GIS's schema exists.
 *
 * The id is shared across both rows, not linked by a separate foreign
 * key column: GIS inserts here first to get an id, then inserts its own
 * detail row using that same id as both PK and FK. Both inserts belong
 * in one transaction — an orphaned row on either side is a bug.
 */
export const assets = pgTable(
    "assets",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        ...organizationScopedColumns(),
        ownerModule: text("owner_module", { enum: MODULE_KEYS }).notNull(),
        label: text("label").notNull(),
        assetType: text("asset_type").notNull(),
        location: pointColumn("location"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index("assets_org_idx").on(table.organizationId)],
);