import { boolean, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { organization, user } from "../auth";
import { assets } from "./assets";

export function organizationScopedColumns() {
    return {
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
    };
}

/**
 * Branch-versioned columns. A row is one VERSION of a logical entity.
 *
 * - `id` is the stable identity (points at core.assets.id — the one place
 *   guaranteed unique per entity, so other tables can hold a real FK to
 *   "that node" without caring which version is current).
 * - `versionId` is this row's own primary key — the right FK target when
 *   something belongs to ONE specific edit (see dma_boundary_valves).
 * - Only one row per (id, branch) may have isHead = true; a partial unique
 *   index on each table enforces it.
 * - `isDeleted` makes this row a tombstone. A branch can't hide an entity
 *   that exists on main by simply deleting a row (that would delete it
 *   from main's history too), so deletion is itself a new version.
 *
 * Editing = insert a new row for the same id and flip the previous head's
 * isHead, in one transaction. Different entities, and the same entity on
 * different branches, never touch the same row — which is what keeps
 * concurrent edits from blocking each other.
 */
export function versionedColumns() {
    return {
        versionId: text("version_id").primaryKey().$defaultFn(() => createId()),
        id: text("id")
            .notNull()
            .references(() => assets.id)
            .$defaultFn(() => createId()),
        branch: text("branch").notNull().default("main"),
        isHead: boolean("is_head").notNull().default(true),
        isDeleted: boolean("is_deleted").notNull().default(false),
        supersedesVersionId: text("supersedes_version_id"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        createdByUserId: text("created_by_user_id")
            .notNull()
            .references(() => user.id),
    };
}