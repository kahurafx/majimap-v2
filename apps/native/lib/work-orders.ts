import { ClipboardCheck, Droplets, Waves, Wrench, type LucideIcon } from "lucide-react-native";
import type { NetworkNode, Point } from "@majimap/shared-types";
import { approxMetres } from "./assets";
import { CENTER } from "./mock-data";

export type WorkOrderKind = "leak" | "inspection" | "valve_replacement" | "flushing";
export type WorkOrderPriority = "urgent" | "high" | "normal";
export type WorkOrderStatus = "pending" | "in_progress" | "blocked" | "completed";
/** "partial" still exists on the server; the field flow only offers done and no_fault. */
export type Outcome = "done" | "partial" | "no_fault";

export type WorkOrder = {
    id: string;
    code: string;
    title: string;
    kind: WorkOrderKind;
    priority: WorkOrderPriority;
    status: WorkOrderStatus;
    description: string;
    /** Who or what raised it, e.g. "Customer call". */
    source: string;
    createdAt: string;
    dueAt: string;
    /** The asset the job is about, if it's a known one. */
    assetId: string | null;
    /** Where the job is. Null for reports that arrived without a position (a leak called in). */
    location: Point | null;
    /** The reporter's own description of the place, used when there's no position. */
    locationNote: string | null;
    hold?: { reason: string; note: string; at: string; photoCount: number };
    completion?: { at: string; outcome: Outcome; note: string; photoCount: number };
};

export const KIND_LABEL: Record<WorkOrderKind, string> = { leak: "Leak", inspection: "Inspection", valve_replacement: "Valve replacement", flushing: "Flushing" };
export const KIND_ICON: Record<WorkOrderKind, LucideIcon> = { leak: Droplets, inspection: ClipboardCheck, valve_replacement: Wrench, flushing: Waves };
export const OUTCOME_LABEL: Record<Outcome, string> = { done: "Job done", partial: "Partly done", no_fault: "No fault found" };
export const FINISH_OUTCOMES: Outcome[] = ["done", "no_fault"];
export const HOLD_REASONS = ["Can't get access", "Parts or tools needed", "Needs an engineer", "Safety concern", "Other"];

const hoursFromNow = (n: number) => new Date(Date.now() + n * 3600000).toISOString();
const hoursAgo = (n: number) => new Date(Date.now() - n * 3600000).toISOString();

export const mockWorkOrders: WorkOrder[] = [
    {
        id: "wo-1", code: "WO-1042", title: "Burst pipe reported", kind: "leak", priority: "urgent", status: "pending",
        description: "Water is running down the road outside the market. A shop owner called it in and says it started around 7 this morning.",
        source: "Customer call", createdAt: hoursAgo(2), dueAt: hoursFromNow(4), assetId: null, location: null, locationNote: "Near Kileleshwa market, Mwanzi Rd",
    },
    {
        id: "wo-2", code: "WO-1038", title: "Replace Valve KLS-03", kind: "valve_replacement", priority: "high", status: "pending",
        description: "The spindle is seized and the valve won't close fully. Replace it with a new gate valve of the same size.",
        source: "Inspection finding", createdAt: hoursAgo(26), dueAt: hoursFromNow(30), assetId: "n-valve-3", location: null, locationNote: null,
    },
    {
        id: "wo-3", code: "WO-1031", title: "Inspect Junction J-14", kind: "inspection", priority: "normal", status: "pending",
        description: "Routine inspection. The last visit found surface rust on the flange.",
        source: "Inspection schedule", createdAt: hoursAgo(70), dueAt: hoursFromNow(72), assetId: "n-junc-1", location: null, locationNote: null,
    },
    {
        id: "wo-4", code: "WO-1029", title: "Flush the 200 mm main", kind: "flushing", priority: "normal", status: "pending",
        description: "Customers on Othaya Rd report brown water. Flush the main at the hydrant until it runs clear.",
        source: "Customer complaints", createdAt: hoursAgo(20), dueAt: hoursFromNow(120), assetId: null,
        location: { lat: CENTER.lat + 0.0025, lng: CENTER.lng - 0.001 }, locationNote: "Othaya Rd",
    },
    {
        id: "wo-5", code: "WO-1027", title: "Inspect Valve KLS-02", kind: "inspection", priority: "high", status: "in_progress",
        description: "Overdue inspection. The valve was stiff to turn last time.",
        source: "Inspection schedule", createdAt: hoursAgo(50), dueAt: hoursFromNow(6), assetId: "n-valve-2", location: null, locationNote: null,
    },
    {
        id: "wo-6", code: "WO-1019", title: "Inspect Hydrant H-07", kind: "inspection", priority: "normal", status: "blocked",
        description: "Hydrant cap was corroded at the last visit. Confirm whether it needs replacing.",
        source: "Inspection schedule", createdAt: hoursAgo(90), dueAt: hoursFromNow(-5), assetId: "n-hyd-1", location: null, locationNote: null,
        hold: { reason: "Can't get access", note: "Car parked over the cover. Owner not around.", at: hoursAgo(5), photoCount: 1 },
    },
    {
        id: "wo-7", code: "WO-1012", title: "Inspect Bulk Meter M-22", kind: "inspection", priority: "normal", status: "completed",
        description: "Quarterly check of the bulk meter against the log.",
        source: "Inspection schedule", createdAt: hoursAgo(120), dueAt: hoursAgo(30), assetId: "n-meter-1", location: null, locationNote: null,
        completion: { at: hoursAgo(28), outcome: "done", note: "Reading matches the log. No leaks in the chamber.", photoCount: 2 },
    },
];

export const openOrders = (orders: WorkOrder[]) => orders.filter((o) => o.status !== "completed");

export type RankedOrder = { order: WorkOrder; location: Point | null; distanceM: number | null };

/**
 * A job you've started comes first. Then priority. Within a priority, jobs we
 * can place come first, nearest to the technician; jobs with no position
 * follow, soonest due first. Without a GPS fix everything falls back to due date.
 */
export function rankOrders(orders: WorkOrder[], nodes: Pick<NetworkNode, "id" | "location">[], here: Point | null): RankedOrder[] {
    const rank = { urgent: 0, high: 1, normal: 2 } as const;
    const withPlace = orders.map((order) => {
        const location = order.location ?? nodes.find((n) => n.id === order.assetId)?.location ?? null;
        return { order, location, distanceM: here && location ? approxMetres(here, location) : null };
    });
    return withPlace.sort(
        (a, b) =>
            Number(b.order.status === "in_progress") - Number(a.order.status === "in_progress") ||
            rank[a.order.priority] - rank[b.order.priority] ||
            Number(a.distanceM === null) - Number(b.distanceM === null) ||
            (a.distanceM !== null && b.distanceM !== null ? a.distanceM - b.distanceM : a.order.dueAt.localeCompare(b.order.dueAt)),
    );
}

export function dueLabel(iso: string): { text: string; overdue: boolean } {
    const hours = Math.round((new Date(iso).getTime() - Date.now()) / 3600000);
    if (hours < 0) return { text: "Overdue", overdue: true };
    if (hours < 24) return { text: `Due in ${Math.max(hours, 1)} h`, overdue: false };
    return { text: `Due in ${Math.round(hours / 24)} d`, overdue: false };
}

export const formatDistance = (m: number) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);