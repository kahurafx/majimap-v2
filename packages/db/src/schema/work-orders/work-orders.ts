import { index, integer, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { organization, user } from "../auth";
import { assets } from "../core/assets";
import { organizationScopedColumns } from "../core/columns";
import { pointColumn } from "../core/geometry";
import { stepActionEnum, workOrderKindEnum, workOrderOutcomeEnum, workOrderPriorityEnum, workOrderStatusEnum, workOrdersSchema } from "./shared";

export const workOrders = workOrdersSchema.table(
    "work_orders",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        ...organizationScopedColumns(),
        /** Human-friendly, per organization: WO-1001, WO-1002… */
        code: text("code").notNull(),
        title: text("title").notNull(),
        description: text("description").notNull().default(""),
        kind: workOrderKindEnum("kind").notNull(),
        priority: workOrderPriorityEnum("priority").notNull().default("normal"),
        status: workOrderStatusEnum("status").notNull().default("pending"),
        /** Who or what raised it: "Customer call", "Inspection schedule"… */
        source: text("source").notNull().default("Office"),
        /** The stable asset identity in core.assets, never a version. */
        assetId: text("asset_id").references(() => assets.id),
        /** Null when the report came without a position. `locationNote` is then the reporter's own words. */
        location: pointColumn("location"),
        locationNote: text("location_note"),
        assignedToUserId: text("assigned_to_user_id").references(() => user.id),
        dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
        startedAt: timestamp("started_at", { withTimezone: true }),
        holdReason: text("hold_reason"),
        holdNote: text("hold_note"),
        heldAt: timestamp("held_at", { withTimezone: true }),
        completedAt: timestamp("completed_at", { withTimezone: true }),
        outcome: workOrderOutcomeEnum("outcome"),
        completionNote: text("completion_note"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        createdByUserId: text("created_by_user_id").notNull().references(() => user.id),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("work_orders_code_unique").on(table.organizationId, table.code),
        index("work_orders_org_status_idx").on(table.organizationId, table.status),
        index("work_orders_assignee_idx").on(table.assignedToUserId, table.status),
        index("work_orders_asset_idx").on(table.assetId),
    ],
);

export const workOrderSteps = workOrdersSchema.table(
    "work_order_steps",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        workOrderId: text("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
        position: integer("position").notNull(),
        label: text("label").notNull(),
        action: stepActionEnum("action"),
        doneAt: timestamp("done_at", { withTimezone: true }),
        doneByUserId: text("done_by_user_id").references(() => user.id),
    },
    (table) => [uniqueIndex("work_order_steps_position_unique").on(table.workOrderId, table.position)],
);

/**
 * Everything a device does to a job, once each. The id comes from the device,
 * so a retried sync finds its own event and does nothing twice. Rejected
 * events are kept too (with the reason): the audit trail shows what was tried.
 */
export const workOrderEvents = workOrdersSchema.table(
    "work_order_events",
    {
        id: text("id").primaryKey(),
        ...organizationScopedColumns(),
        workOrderId: text("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
        type: text("type", { enum: ["start", "resume", "hold", "complete", "step", "log_link"] }).notNull(),
        outcome: text("outcome", { enum: ["applied", "unchanged", "replayed", "rejected", "stale"] }).notNull(),
        reason: text("reason"),
        payload: jsonb("payload").notNull(),
        actorUserId: text("actor_user_id").notNull().references(() => user.id),
        occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
        syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index("work_order_events_order_idx").on(table.workOrderId, table.occurredAt)],
);

/**
 * Which logs were recorded as part of a job. `logId` points into the GIS log
 * tables by id only, with no foreign key: modules don't hold keys into each other.
 */
export const workOrderLogLinks = workOrdersSchema.table(
    "work_order_log_links",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        workOrderId: text("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
        logKind: text("log_kind", { enum: ["condition", "valve"] }).notNull(),
        logId: text("log_id").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [uniqueIndex("work_order_log_link_unique").on(table.workOrderId, table.logKind, table.logId)],
);

/** One row per organization: the next number to hand out. */
export const workOrderCounters = workOrdersSchema.table("work_order_counters", {
    organizationId: text("organization_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
    nextNumber: integer("next_number").notNull().default(1),
});