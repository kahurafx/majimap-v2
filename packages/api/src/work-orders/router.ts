import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
    assets, conditionLogs, domainEvents, gisUserRoles, valveStateLogs,
    workOrderCounters, workOrderEvents, workOrderLogLinks, workOrderSteps, workOrders, type Database,
} from "@majimap/db";
import {
    StepActionSchema, WorkOrderKindSchema, WorkOrderOutcomeSchema, WorkOrderPrioritySchema, WorkOrderStatusSchema,
    type Role, type WorkOrder,
} from "@majimap/shared-types";
import { EntityIdSchema, GeoPointInput, rethrowDbError } from "../gis/versioning";
import { photoCounts } from "../photo-counts";
import { parseDeviceTime } from "../time";
import { router, workOrderProcedure, workOrderRoleProcedure } from "../trpc";
import { planTransition, type Action } from "./transitions";
import { defaultSteps } from "./templates";

type OrderRow = typeof workOrders.$inferSelect;
type StepRow = typeof workOrderSteps.$inferSelect;
type EventType = typeof workOrderEvents.$inferInsert.type;
type EventOutcome = typeof workOrderEvents.$inferInsert.outcome;

const WRITE_ROLES: Role[] = ["admin", "gis_engineer", "field_technician"];
const MANAGE_ROLES: Role[] = ["admin", "gis_engineer"];
/** How long a finished job stays in a technician's list. */
const DONE_VISIBLE_DAYS = 14;

/* ---------- reading ---------- */

function toDto(row: OrderRow, steps: StepRow[], photos: number): WorkOrder {
    return {
        id: row.id,
        code: row.code,
        title: row.title,
        kind: row.kind,
        priority: row.priority,
        status: row.status,
        description: row.description,
        source: row.source,
        createdAt: row.createdAt.toISOString(),
        dueAt: row.dueAt.toISOString(),
        assetId: row.assetId,
        location: row.location,
        locationNote: row.locationNote,
        assignedToUserId: row.assignedToUserId,
        checklist: steps.map((s) => ({ id: s.id, label: s.label, done: s.doneAt !== null, ...(s.action ? { action: s.action } : {}) })),
        hold:
            row.status === "blocked" && row.holdReason
                ? { reason: row.holdReason, note: row.holdNote ?? "", at: (row.heldAt ?? row.updatedAt).toISOString() }
                : undefined,
        completion:
            row.status === "completed" && row.completedAt && row.outcome
                ? { at: row.completedAt.toISOString(), outcome: row.outcome, note: row.completionNote ?? "", photoCount: photos }
                : undefined,
    };
}

async function hydrate(db: Database, orgId: string, rows: OrderRow[]): Promise<WorkOrder[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const steps = await db.select().from(workOrderSteps).where(inArray(workOrderSteps.workOrderId, ids)).orderBy(asc(workOrderSteps.position));
    const photos = await photoCounts(db, orgId, "work_order", ids);
    return rows.map((row) => toDto(row, steps.filter((s) => s.workOrderId === row.id), photos.get(row.id) ?? 0));
}

async function loadOrder(db: Database, orgId: string, id: string, lock = false): Promise<OrderRow> {
    const query = db.select().from(workOrders).where(and(eq(workOrders.id, id), eq(workOrders.organizationId, orgId))).limit(1);
    const [row] = lock ? await query.for("update") : await query;
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });
    return row;
}

async function loadOne(db: Database, orgId: string, id: string): Promise<WorkOrder> {
    const [dto] = await hydrate(db, orgId, [await loadOrder(db, orgId, id)]);
    return dto!;
}

/* ---------- acting on a job ---------- */

const isManager = (role: Role) => MANAGE_ROLES.includes(role);

/** Technicians act on their own jobs, or on ones nobody has picked up. Managers act on any. */
function assertCanAct(order: OrderRow, userId: string, role: Role) {
    if (isManager(role)) return;
    if (order.assignedToUserId && order.assignedToUserId !== userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This job is assigned to someone else" });
    }
}

/** A retried event finds itself here and does nothing twice. */
async function findReplay(db: Database, orgId: string, eventId: string): Promise<string | null> {
    const [existing] = await db
        .select({ orgId: workOrderEvents.organizationId, workOrderId: workOrderEvents.workOrderId })
        .from(workOrderEvents)
        .where(eq(workOrderEvents.id, eventId))
        .limit(1);
    if (!existing) return null;
    if (existing.orgId !== orgId) throw new TRPCError({ code: "CONFLICT", message: "That id is already in use" });
    return existing.workOrderId;
}

async function recordEvent(
    db: Database,
    a: { id: string; orgId: string; workOrderId: string; type: EventType; outcome: EventOutcome; reason?: string; payload: Record<string, unknown>; userId: string; occurredAt: Date },
) {
    await db.insert(workOrderEvents).values({
        id: a.id,
        organizationId: a.orgId,
        workOrderId: a.workOrderId,
        type: a.type,
        outcome: a.outcome,
        reason: a.reason ?? null,
        payload: a.payload,
        actorUserId: a.userId,
        occurredAt: a.occurredAt,
    });
}

/** Other modules can react to these without work orders knowing they exist. */
async function emit(db: Database, orgId: string, type: string, payload: Record<string, unknown>) {
    await db.insert(domainEvents).values({ organizationId: orgId, type, sourceModule: "work_orders", payload });
}

async function nextCode(db: Database, orgId: string): Promise<string> {
    // First insert hands out 1 and leaves 2; each later call bumps the counter and reads it back.
    const [row] = await db
        .insert(workOrderCounters)
        .values({ organizationId: orgId, nextNumber: 2 })
        .onConflictDoUpdate({ target: workOrderCounters.organizationId, set: { nextNumber: sql`${workOrderCounters.nextNumber} + 1` } })
        .returning({ next: workOrderCounters.nextNumber });
    return `WO-${1000 + (row!.next - 1)}`;
}

async function assertAssignee(db: Database, orgId: string, userId: string) {
    const [row] = await db
        .select({ id: gisUserRoles.id })
        .from(gisUserRoles)
        .where(and(eq(gisUserRoles.organizationId, orgId), eq(gisUserRoles.userId, userId)))
        .limit(1);
    if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "That person can't be assigned work in this organization" });
}

const ActionInput = z.discriminatedUnion("type", [
    z.object({ type: z.literal("start") }),
    z.object({ type: z.literal("resume") }),
    z.object({ type: z.literal("hold"), reason: z.string().trim().min(1).max(100), note: z.string().trim().max(2000).default("") }),
    z.object({ type: z.literal("complete"), outcome: WorkOrderOutcomeSchema, note: z.string().trim().max(2000).default("") }),
]);

export const workOrdersRouter = router({
    /** What's on my plate: my jobs, jobs nobody has picked up yet, and what I finished recently. */
    mine: workOrderProcedure.query(async ({ ctx }) => {
        const since = new Date(Date.now() - DONE_VISIBLE_DAYS * 86_400_000);
        const rows = await ctx.db
            .select()
            .from(workOrders)
            .where(
                and(
                    eq(workOrders.organizationId, ctx.organizationId),
                    ne(workOrders.status, "cancelled"),
                    or(eq(workOrders.assignedToUserId, ctx.session.userId), isNull(workOrders.assignedToUserId)),
                    or(ne(workOrders.status, "completed"), gte(workOrders.completedAt, since)),
                ),
            )
            .orderBy(asc(workOrders.dueAt))
            .limit(200);
        return hydrate(ctx.db, ctx.organizationId, rows);
    }),

    list: workOrderProcedure
        .input(
            z
                .object({
                    statuses: z.array(WorkOrderStatusSchema).min(1).optional(),
                    assigneeId: z.string().min(1).optional(),
                    limit: z.number().int().min(1).max(200).default(100),
                })
                .optional(),
        )
        .query(async ({ ctx, input }) => {
            const rows = await ctx.db
                .select()
                .from(workOrders)
                .where(
                    and(
                        eq(workOrders.organizationId, ctx.organizationId),
                        input?.statuses ? inArray(workOrders.status, input.statuses) : undefined,
                        input?.assigneeId ? eq(workOrders.assignedToUserId, input.assigneeId) : undefined,
                    ),
                )
                .orderBy(asc(workOrders.dueAt))
                .limit(input?.limit ?? 100);
            return hydrate(ctx.db, ctx.organizationId, rows);
        }),

    byId: workOrderProcedure.input(z.object({ id: EntityIdSchema })).query(({ ctx, input }) => loadOne(ctx.db, ctx.organizationId, input.id)),

    create: workOrderRoleProcedure(...MANAGE_ROLES)
        .input(
            z.object({
                title: z.string().trim().min(1).max(200),
                description: z.string().trim().max(4000).default(""),
                kind: WorkOrderKindSchema,
                priority: WorkOrderPrioritySchema.default("normal"),
                source: z.string().trim().min(1).max(100).default("Office"),
                dueAt: z.string().datetime(),
                assetId: EntityIdSchema.nullable().default(null),
                location: GeoPointInput.nullable().default(null),
                locationNote: z.string().trim().max(300).nullable().default(null),
                assigneeId: z.string().min(1).nullable().default(null),
                steps: z.array(z.object({ label: z.string().trim().min(1).max(200), action: StepActionSchema.optional() })).max(30).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            try {
                return await ctx.db.transaction(async (tx) => {
                    if (input.assetId) {
                        const [asset] = await tx
                            .select({ id: assets.id })
                            .from(assets)
                            .where(and(eq(assets.id, input.assetId), eq(assets.organizationId, ctx.organizationId), eq(assets.ownerModule, "gis")))
                            .limit(1);
                        if (!asset) throw new TRPCError({ code: "BAD_REQUEST", message: "That asset doesn't exist in this organization" });
                    }
                    if (input.assigneeId) await assertAssignee(tx, ctx.organizationId, input.assigneeId);

                    const steps = input.steps ?? defaultSteps(input.kind, input.assetId !== null);
                    if (steps.some((s) => s.action) && !input.assetId) {
                        throw new TRPCError({ code: "BAD_REQUEST", message: "Inspection and valve steps need an asset to record against" });
                    }

                    const id = createId();
                    const [row] = await tx
                        .insert(workOrders)
                        .values({
                            id,
                            organizationId: ctx.organizationId,
                            code: await nextCode(tx, ctx.organizationId),
                            title: input.title,
                            description: input.description,
                            kind: input.kind,
                            priority: input.priority,
                            source: input.source,
                            assetId: input.assetId,
                            location: input.location,
                            locationNote: input.locationNote,
                            assignedToUserId: input.assigneeId,
                            dueAt: new Date(input.dueAt),
                            createdByUserId: ctx.session.userId,
                        })
                        .returning();
                    if (!row) throw new Error("Insert returned no row");
                    if (steps.length > 0) {
                        await tx.insert(workOrderSteps).values(steps.map((s, position) => ({ workOrderId: id, position, label: s.label, action: s.action ?? null })));
                    }
                    await emit(tx, ctx.organizationId, "work_order.created", { workOrderId: id, assetId: input.assetId, priority: input.priority });
                    return loadOne(tx, ctx.organizationId, id);
                });
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    assign: workOrderRoleProcedure(...MANAGE_ROLES)
        .input(z.object({ id: EntityIdSchema, assigneeId: z.string().min(1).nullable() }))
        .mutation(async ({ ctx, input }) => {
            const order = await loadOrder(ctx.db, ctx.organizationId, input.id);
            if (order.status === "completed" || order.status === "cancelled") {
                throw new TRPCError({ code: "CONFLICT", message: `A ${order.status} job can't be reassigned` });
            }
            if (input.assigneeId) await assertAssignee(ctx.db, ctx.organizationId, input.assigneeId);
            await ctx.db.update(workOrders).set({ assignedToUserId: input.assigneeId, updatedAt: new Date() }).where(eq(workOrders.id, order.id));
            return loadOne(ctx.db, ctx.organizationId, order.id);
        }),

    cancel: workOrderRoleProcedure(...MANAGE_ROLES)
        .input(z.object({ id: EntityIdSchema }))
        .mutation(async ({ ctx, input }) => {
            const order = await loadOrder(ctx.db, ctx.organizationId, input.id);
            if (order.status === "completed") throw new TRPCError({ code: "CONFLICT", message: "A completed job can't be cancelled" });
            if (order.status !== "cancelled") {
                await ctx.db.update(workOrders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(workOrders.id, order.id));
                await emit(ctx.db, ctx.organizationId, "work_order.cancelled", { workOrderId: order.id });
            }
            return loadOne(ctx.db, ctx.organizationId, order.id);
        }),

    /** Start, resume, hold or complete. Safe to retry: the event id makes the second call a no-op. */
    transition: workOrderRoleProcedure(...WRITE_ROLES)
        .input(z.object({ eventId: EntityIdSchema, workOrderId: EntityIdSchema, action: ActionInput, occurredAt: z.string().datetime().optional() }))
        .mutation(async ({ ctx, input }) => {
            const when = parseDeviceTime(input.occurredAt);
            try {
                return await ctx.db.transaction(async (tx) => {
                    const replayed = await findReplay(tx, ctx.organizationId, input.eventId);
                    if (replayed) return { order: await loadOne(tx, ctx.organizationId, replayed), outcome: "replayed" as const, reason: undefined };

                    const order = await loadOrder(tx, ctx.organizationId, input.workOrderId, true);
                    assertCanAct(order, ctx.session.userId, ctx.woRole);

                    const plan = planTransition(order, input.action as Action, ctx.session.userId, when);
                    const outcome: EventOutcome = plan.kind === "apply" ? "applied" : plan.kind === "unchanged" ? "unchanged" : "rejected";
                    const reason = plan.kind === "rejected" ? plan.reason : undefined;

                    if (plan.kind === "apply") {
                        await tx.update(workOrders).set({ ...plan.patch, updatedAt: new Date() }).where(eq(workOrders.id, order.id));
                        if (input.action.type === "complete") {
                            await emit(tx, ctx.organizationId, "work_order.completed", {
                                workOrderId: order.id, assetId: order.assetId, outcome: input.action.outcome, completedByUserId: ctx.session.userId,
                            });
                        } else if (input.action.type === "hold") {
                            await emit(tx, ctx.organizationId, "work_order.held", { workOrderId: order.id, reason: input.action.reason });
                        }
                    }
                    await recordEvent(tx, { id: input.eventId, orgId: ctx.organizationId, workOrderId: order.id, type: input.action.type, outcome, reason, payload: input.action, userId: ctx.session.userId, occurredAt: when });
                    return { order: await loadOne(tx, ctx.organizationId, order.id), outcome, reason };
                });
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    /** Tick or untick a step. Only a job in progress has steps to tick. */
    setStep: workOrderRoleProcedure(...WRITE_ROLES)
        .input(z.object({ eventId: EntityIdSchema, workOrderId: EntityIdSchema, stepId: EntityIdSchema, done: z.boolean(), occurredAt: z.string().datetime().optional() }))
        .mutation(async ({ ctx, input }) => {
            const when = parseDeviceTime(input.occurredAt);
            try {
                return await ctx.db.transaction(async (tx) => {
                    const replayed = await findReplay(tx, ctx.organizationId, input.eventId);
                    if (replayed) return { order: await loadOne(tx, ctx.organizationId, replayed), outcome: "replayed" as const, reason: undefined };

                    const order = await loadOrder(tx, ctx.organizationId, input.workOrderId, true);
                    assertCanAct(order, ctx.session.userId, ctx.woRole);

                    let outcome: EventOutcome = "applied";
                    let reason: string | undefined;
                    if (order.status !== "in_progress") {
                        outcome = "rejected";
                        reason = order.status === "completed" || order.status === "cancelled" ? `This job is ${order.status}` : "Start the job to tick off steps";
                    } else {
                        const [step] = await tx
                            .select()
                            .from(workOrderSteps)
                            .where(and(eq(workOrderSteps.id, input.stepId), eq(workOrderSteps.workOrderId, order.id)))
                            .limit(1);
                        if (!step) throw new TRPCError({ code: "NOT_FOUND", message: "Step not found" });
                        if ((step.doneAt !== null) === input.done) outcome = "unchanged";
                        else {
                            await tx
                                .update(workOrderSteps)
                                .set({ doneAt: input.done ? when : null, doneByUserId: input.done ? ctx.session.userId : null })
                                .where(eq(workOrderSteps.id, step.id));
                        }
                    }
                    await recordEvent(tx, { id: input.eventId, orgId: ctx.organizationId, workOrderId: order.id, type: "step", outcome, reason, payload: { stepId: input.stepId, done: input.done }, userId: ctx.session.userId, occurredAt: when });
                    return { order: await loadOne(tx, ctx.organizationId, order.id), outcome, reason };
                });
            } catch (err) {
                rethrowDbError(err);
            }
        }),

    /**
     * "This inspection or valve log was part of that job." Called AFTER the log itself has
     * synced (NOT_FOUND means it hasn't arrived yet: retry). Starts the job if it hadn't been
     * started and ticks the first matching step. GIS doesn't know work orders exist.
     */
    linkLog: workOrderRoleProcedure(...WRITE_ROLES)
        .input(z.object({ eventId: EntityIdSchema, workOrderId: EntityIdSchema, logKind: z.enum(["condition", "valve"]), logId: EntityIdSchema, occurredAt: z.string().datetime().optional() }))
        .mutation(async ({ ctx, input }) => {
            const when = parseDeviceTime(input.occurredAt);
            try {
                return await ctx.db.transaction(async (tx) => {
                    const replayed = await findReplay(tx, ctx.organizationId, input.eventId);
                    if (replayed) return { order: await loadOne(tx, ctx.organizationId, replayed), outcome: "replayed" as const, reason: undefined };

                    const order = await loadOrder(tx, ctx.organizationId, input.workOrderId, true);
                    assertCanAct(order, ctx.session.userId, ctx.woRole);

                    const [log] =
                        input.logKind === "condition"
                            ? await tx
                                .select({ assetId: conditionLogs.assetId, by: conditionLogs.recordedByUserId })
                                .from(conditionLogs)
                                .where(and(eq(conditionLogs.id, input.logId), eq(conditionLogs.organizationId, ctx.organizationId)))
                                .limit(1)
                            : await tx
                                .select({ assetId: valveStateLogs.valveId, by: valveStateLogs.changedByUserId })
                                .from(valveStateLogs)
                                .where(and(eq(valveStateLogs.id, input.logId), eq(valveStateLogs.organizationId, ctx.organizationId)))
                                .limit(1);
                    if (!log) throw new TRPCError({ code: "NOT_FOUND", message: "That log hasn't reached the server yet" });
                    if (log.by !== ctx.session.userId && !isManager(ctx.woRole)) {
                        throw new TRPCError({ code: "FORBIDDEN", message: "You can only link your own logs" });
                    }
                    if (order.assetId && order.assetId !== log.assetId) {
                        throw new TRPCError({ code: "BAD_REQUEST", message: "That log is for a different asset" });
                    }

                    const linked = await tx
                        .insert(workOrderLogLinks)
                        .values({ workOrderId: order.id, logKind: input.logKind, logId: input.logId })
                        .onConflictDoNothing()
                        .returning({ id: workOrderLogLinks.id });

                    let outcome: EventOutcome = linked.length === 0 ? "unchanged" : "applied";
                    if (order.status === "completed" || order.status === "cancelled") {
                        // Kept as history; a finished job doesn't change.
                        if (linked.length > 0) outcome = "stale";
                    } else if (linked.length > 0) {
                        const start = planTransition(order, { type: "start" }, ctx.session.userId, when);
                        if (start.kind === "apply") {
                            await tx.update(workOrders).set({ ...start.patch, updatedAt: new Date() }).where(eq(workOrders.id, order.id));
                        }
                        const action = input.logKind === "condition" ? "inspect" : "valve";
                        const [step] = await tx
                            .select()
                            .from(workOrderSteps)
                            .where(and(eq(workOrderSteps.workOrderId, order.id), eq(workOrderSteps.action, action), isNull(workOrderSteps.doneAt)))
                            .orderBy(asc(workOrderSteps.position))
                            .limit(1);
                        if (step) await tx.update(workOrderSteps).set({ doneAt: when, doneByUserId: ctx.session.userId }).where(eq(workOrderSteps.id, step.id));
                    }
                    await recordEvent(tx, { id: input.eventId, orgId: ctx.organizationId, workOrderId: order.id, type: "log_link", outcome, payload: { logKind: input.logKind, logId: input.logId }, userId: ctx.session.userId, occurredAt: when });
                    return { order: await loadOne(tx, ctx.organizationId, order.id), outcome, reason: undefined };
                });
            } catch (err) {
                rethrowDbError(err);
            }
        }),
});