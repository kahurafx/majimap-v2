import { integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { organizationScopedColumns } from "../core/columns";
import { assets } from "../core/assets";
import { gisSchema } from "./shared";

/** Not versioned — system configuration (Transmission/Distribution/DMA), not topology technicians edit concurrently in the field. */
export const tiers = gisSchema.table(
    "tiers",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        ...organizationScopedColumns(),
        name: text("name").notNull(),
        order: integer("order").notNull(),
    },
    (table) => [uniqueIndex("tiers_org_order_unique").on(table.organizationId, table.order)],
);

/**
 * Also not versioned, for the same reason as tiers — controller
 * reassignment is infrequent and administrative. Membership is never
 * stored here: it's always recomputed by tracing live from
 * controllerNodeId, exactly like traceSubnetworkMembership() already
 * does against mock data on the frontend. This table just records the
 * trace's starting point and when it was last run.
 */
export const subnetworks = gisSchema.table("subnetworks", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    ...organizationScopedColumns(),
    name: text("name").notNull(),
    tierId: text("tier_id").notNull().references(() => tiers.id),
    controllerNodeId: text("controller_node_id").notNull().references(() => assets.id),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
});