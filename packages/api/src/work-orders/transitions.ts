import type { WorkOrderOutcome, WorkOrderStatus } from "@majimap/shared-types";

export type Action =
    | { type: "start" }
    | { type: "resume" }
    | { type: "hold"; reason: string; note: string }
    | { type: "complete"; outcome: WorkOrderOutcome; note: string };

export type OrderState = { status: WorkOrderStatus; assignedToUserId: string | null };

export type OrderPatch = Partial<{
    status: WorkOrderStatus;
    assignedToUserId: string;
    startedAt: Date;
    holdReason: string | null;
    holdNote: string | null;
    heldAt: Date | null;
    completedAt: Date;
    outcome: WorkOrderOutcome;
    completionNote: string;
}>;

export type TransitionPlan =
    | { kind: "apply"; patch: OrderPatch }
    | { kind: "unchanged" }
    | { kind: "rejected"; reason: string };

const CLEAR_HOLD = { holdReason: null, holdNote: null, heldAt: null } as const;

/**
 * The state machine for a job, with no database in it so every case can be tested directly.
 * Anything a device can't know about (the job was completed, cancelled or reassigned while it
 * was offline) comes back `rejected` with a reason, not as an error: the person needs to see
 * it, and the attempt is kept in the event log. Doing something twice is `unchanged`.
 */
export function planTransition(order: OrderState, action: Action, userId: string, when: Date): TransitionPlan {
    if (order.status === "cancelled") return { kind: "rejected", reason: "This job was cancelled" };

    switch (action.type) {
        case "start":
        case "resume": {
            if (order.status === "in_progress") return { kind: "unchanged" };
            if (order.status === "completed") return { kind: "rejected", reason: "This job is already completed" };
            // pending or blocked. Starting an unassigned job claims it for the caller.
            return {
                kind: "apply",
                patch: {
                    status: "in_progress",
                    assignedToUserId: order.assignedToUserId ?? userId,
                    ...(order.status === "pending" ? { startedAt: when } : {}),
                    ...CLEAR_HOLD,
                },
            };
        }
        case "hold": {
            if (order.status === "blocked") return { kind: "unchanged" };
            if (order.status === "completed") return { kind: "rejected", reason: "This job is already completed" };
            if (order.status === "pending") return { kind: "rejected", reason: "Start the job before putting it on hold" };
            return { kind: "apply", patch: { status: "blocked", holdReason: action.reason, holdNote: action.note, heldAt: when } };
        }
        case "complete": {
            if (order.status === "completed") return { kind: "unchanged" };
            if (order.status !== "in_progress") return { kind: "rejected", reason: "Start the job before completing it" };
            return { kind: "apply", patch: { status: "completed", completedAt: when, outcome: action.outcome, completionNote: action.note, ...CLEAR_HOLD } };
        }
    }
}