import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { organizationScopedColumns } from "./columns";

/**
 * One customer, shared by GIS (service connection, DMA membership),
 * Billing (account, tariff), and Portal (login) — each module adds its
 * own extension table referencing this id rather than this table growing
 * module-specific columns.
 */
export const customers = pgTable(
    "customers",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        ...organizationScopedColumns(),
        name: text("name").notNull(),
        phone: text("phone"),
        email: text("email"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index("customers_org_idx").on(table.organizationId)],
);