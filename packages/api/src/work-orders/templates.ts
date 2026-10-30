import type { StepAction, WorkOrderKind } from "@majimap/shared-types";

export type StepSeed = { label: string; action?: StepAction };

/**
 * The checklist a job starts with when the office doesn't write its own.
 * Inspection and valve steps only mean something against an asset, so without one they're plain steps.
 */
export function defaultSteps(kind: WorkOrderKind, hasAsset: boolean): StepSeed[] {
    const inspect: StepSeed = hasAsset ? { label: "Record the condition", action: "inspect" } : { label: "Record the condition" };
    const valve: StepSeed = hasAsset ? { label: "Log the valve state", action: "valve" } : { label: "Log the valve state" };
    switch (kind) {
        case "leak":
            return [{ label: "Find the leak and confirm the pipe" }, { label: "Close the valves to isolate it" }, { label: "Repair or clamp the pipe" }, { label: "Flush and restore supply" }, { label: "Photograph the finished repair" }];
        case "valve_replacement":
            return [{ label: "Close the upstream valves" }, { label: "Remove the old valve" }, { label: "Fit the new valve" }, valve, { label: "Test and reopen the line" }];
        case "flushing":
            return [{ label: "Tell the control room you're starting" }, { label: "Open the hydrant and flush" }, { label: "Check the water runs clear" }, { label: "Close the hydrant and log it" }];
        case "inspection":
            return [{ label: "Check the asset and its surroundings" }, inspect];
    }
}