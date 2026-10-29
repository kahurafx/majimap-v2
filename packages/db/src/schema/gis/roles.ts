import { text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { organization, user } from "../auth";
import { gisSchema, gisRoleEnum } from "./shared";

/**
 * GIS-module-specific role — admin/gis_engineer/field_technician/viewer
 * — deliberately separate from Better Auth's org-membership role
 * (owner/admin/member, see auth.ts). Those answer different questions:
 * org role is "can this person manage billing and invite people," this
 * is "what can this person do inside GIS specifically." Not versioned —
 * role assignment is account administration, not network topology.
 */
export const gisUserRoles = gisSchema.table(
    "gis_user_roles",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
        userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
        role: gisRoleEnum("role").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [uniqueIndex("gis_user_role_unique").on(table.organizationId, table.userId)],
);