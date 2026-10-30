import { pgSchema } from "drizzle-orm/pg-core";

/** Its own Postgres schema, like gis: tables here may reference core, never another module's tables. */
export const workOrdersSchema = pgSchema("work_orders");

export const workOrderKindEnum = workOrdersSchema.enum("kind", ["leak", "inspection", "valve_replacement", "flushing"]);
export const workOrderPriorityEnum = workOrdersSchema.enum("priority", ["urgent", "high", "normal"]);
export const workOrderStatusEnum = workOrdersSchema.enum("status", ["pending", "in_progress", "blocked", "completed", "cancelled"]);
export const workOrderOutcomeEnum = workOrdersSchema.enum("outcome", ["done", "partial", "no_fault"]);
export const stepActionEnum = workOrdersSchema.enum("step_action", ["inspect", "valve"]);