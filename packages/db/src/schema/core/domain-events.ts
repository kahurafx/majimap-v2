import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { organizationScopedColumns } from "./columns";

/**
 * The outbox. Any module writes here (e.g. type "asset.condition_changed"
 * when GIS flips a valve to critical); any OTHER enabled module can
 * subscribe without GIS ever knowing it exists. If Work Orders isn't
 * enabled, nothing's subscribed, nothing happens, and GIS doesn't notice
 * either way — this is the mechanism, not just the idea, behind modules
 * staying decoupled while still integrating when both are turned on.
 */

export const domainEvents = pgTable(
    "domain_events",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        ...organizationScopedColumns(),
        type: text("type").notNull(),
        sourceModule: text("source_module").notNull(),
        payload: jsonb("payload").notNull(),
        occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
        processedAt: timestamp("processed_at", { withTimezone: true }),
    },
    (table) => [
        index("domain_events_org_idx").on(table.organizationId),
        index("domain_events_unprocessed_idx").on(table.processedAt),
    ],
);