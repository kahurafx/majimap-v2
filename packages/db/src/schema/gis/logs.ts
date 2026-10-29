import { boolean, index, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { user } from "../auth";
import { assets } from "../core/assets";
import { organizationScopedColumns } from "../core/columns";
import { conditionEnum, gisSchema } from "./shared";

/*
 * Inspection and valve-operation records. Unlike nodes, pipes and DMAs these
 * are NOT versioned: a log is a fact — someone looked at this valve, on this
 * day, and wrote this down — not a proposal that can be superseded, branched or
 * reconciled. They're append-only, keyed by the shared asset registry (so one
 * table serves nodes, pipes and structures alike), and carry two timestamps:
 * when it happened according to the device that recorded it, and when the
 * server received it. The ids are client-suppliable so an offline device can
 * retry a sync without creating duplicates.
 *
 * `branch` records which branch the technician was working on when they
 * logged it. The fact itself doesn't depend on that — discarding a branch
 * discards its proposed edits, not the inspection that prompted them.
 */

export const ASSET_KINDS = ["node", "pipe", "structure"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const conditionLogs = gisSchema.table(
    "condition_logs",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        ...organizationScopedColumns(),
        assetId: text("asset_id").notNull().references(() => assets.id),
        assetKind: text("asset_kind", { enum: ASSET_KINDS }).notNull(),
        branch: text("branch").notNull().default("main"),
        condition: conditionEnum("condition").notNull(),
        note: text("note"),
        recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
        syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
        recordedByUserId: text("recorded_by_user_id").notNull().references(() => user.id),
    },
    (table) => [
        index("condition_logs_asset_idx").on(table.assetId, table.recordedAt),
        index("condition_logs_org_recorded_idx").on(table.organizationId, table.recordedAt),
    ],
);

export const valveStateLogs = gisSchema.table(
    "valve_state_logs",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        ...organizationScopedColumns(),
        valveId: text("valve_id").notNull().references(() => assets.id),
        branch: text("branch").notNull().default("main"),
        isOpen: boolean("is_open").notNull(),
        note: text("note"),
        changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
        syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
        changedByUserId: text("changed_by_user_id").notNull().references(() => user.id),
    },
    (table) => [index("valve_state_logs_valve_idx").on(table.valveId, table.changedAt)],
);