import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planTransition, type OrderState } from "./transitions";

const when = new Date("2026-10-30T08:00:00Z");
const order = (status: OrderState["status"], assignedToUserId: string | null = null): OrderState => ({ status, assignedToUserId });

describe("planTransition", () => {
    it("starting an unassigned job claims it for the caller", () => {
        const plan = planTransition(order("pending"), { type: "start" }, "u1", when);
        assert.deepEqual(plan, { kind: "apply", patch: { status: "in_progress", assignedToUserId: "u1", startedAt: when, holdReason: null, holdNote: null, heldAt: null } });
    });

    it("keeps the existing assignee when starting", () => {
        const plan = planTransition(order("pending", "u2"), { type: "start" }, "u1", when);
        assert.equal(plan.kind === "apply" && plan.patch.assignedToUserId, "u2");
    });

    it("treats a second start as no change", () => {
        assert.deepEqual(planTransition(order("in_progress"), { type: "start" }, "u1", when), { kind: "unchanged" });
    });

    it("resuming from hold clears the hold and keeps the original start time", () => {
        const plan = planTransition(order("blocked", "u1"), { type: "resume" }, "u1", when);
        assert.equal(plan.kind, "apply");
        if (plan.kind === "apply") {
            assert.equal(plan.patch.status, "in_progress");
            assert.equal(plan.patch.holdReason, null);
            assert.equal("startedAt" in plan.patch, false);
        }
    });

    it("can only hold or complete a job that has been started", () => {
        assert.equal(planTransition(order("pending"), { type: "hold", reason: "No access", note: "" }, "u1", when).kind, "rejected");
        assert.equal(planTransition(order("blocked"), { type: "complete", outcome: "done", note: "" }, "u1", when).kind, "rejected");
    });

    it("completing twice is no change; touching a cancelled job is rejected with a reason", () => {
        assert.deepEqual(planTransition(order("completed"), { type: "complete", outcome: "done", note: "" }, "u1", when), { kind: "unchanged" });
        assert.deepEqual(planTransition(order("cancelled"), { type: "start" }, "u1", when), { kind: "rejected", reason: "This job was cancelled" });
    });
});