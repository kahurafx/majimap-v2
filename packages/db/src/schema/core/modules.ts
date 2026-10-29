import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { organization } from "../auth";

export const MODULE_KEYS = ["gis", "billing", "inventory", "work_orders", "portal"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const organizationModules = pgTable(
    "organization_modules",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
        moduleKey: text("module_key", { enum: MODULE_KEYS }).notNull(),
        enabled: boolean("enabled").notNull().default(false),
        enabledAt: timestamp("enabled_at", { withTimezone: true }),
    },
    (table) => [
        uniqueIndex("org_module_unique").on(table.organizationId, table.moduleKey),
        index("organization_modules_org_idx").on(table.organizationId),
    ],
);