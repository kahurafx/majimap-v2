import { formatCoords, formatDate, titleCase } from "./assets";
import type { Condition } from "@majimap/shared-types";
import { CONDITION_LABEL } from "./theme";

/**
 * Shapes follow reconcile.ts (branches / preview / post). One addition: each
 * written entity carries `changes` (field, from, to). The real `preview`
 * returns only `changedFields` today; showing before and after needs the
 * server to send the values too (see the backend notes).
 */
export const EXISTENCE_FIELD = "__existence__";

export type EntityType = "node" | "structure" | "pipe" | "dma";
export type MergeMode = "create" | "fast-forward" | "merge" | "delete" | "restore";
export type SkipReason = "created-and-deleted-on-branch" | "no-change" | "kept-main";
export type FieldChange = { field: string; from: unknown; to: unknown };
export type FieldConflict = { field: string; base: unknown; branch: unknown; main: unknown };

export type Plan =
    | { kind: "write"; mode: MergeMode; changes: FieldChange[] }
    | { kind: "skip"; reason: SkipReason }
    | { kind: "conflict"; conflicts: FieldConflict[] };

export type ReviewEntity = {
    id: string;
    entityType: EntityType;
    name: string;
    plan: Plan;
    /** MOCK ONLY: makes posting fail the way the server's integrity check can. */
    mockViolation?: string;
};

export type ReviewBranch = {
    branch: string;
    authorName: string;
    firstEditAt: string;
    lastEditAt: string;
    token: string;
    entities: ReviewEntity[];
};

/** entity id, then field, then which side wins. */
export type Resolutions = Record<string, Record<string, "branch" | "main">>;
export type Violation = { code: string; entityId: string; relatedId: string; message: string };
export type PostSummary = { created: number; fastForwarded: number; merged: number; deleted: number; restored: number; skipped: number };
export type PostResult =
    | { status: "conflicts" }
    | { status: "posted"; summary: PostSummary }
    | { status: "invalid"; violations: Violation[] };

/* ---------- display helpers ---------- */

const FIELD_LABEL: Record<string, string> = {
    name: "Name", location: "Location", condition: "Condition", isOpen: "Valve state", structureId: "Housed in",
    installedAt: "Installed", lastInspectedAt: "Last inspected", path: "Route", material: "Material", diameterMm: "Diameter",
    color: "Colour", tierId: "Tier", inletMeterId: "Inlet meter", boundary: "Boundary", boundaryValveIds: "Boundary valves",
    [EXISTENCE_FIELD]: "Whether it exists",
};
export const fieldLabel = (f: string) => FIELD_LABEL[f] ?? titleCase(f);

export function formatValue(field: string, v: unknown): string {
    if (v === null || v === undefined || v === "") return "None";
    if (field === "condition") return CONDITION_LABEL[v as Condition] ?? String(v);
    if (field === "isOpen") return v === true ? "Open" : v === false ? "Closed" : "Unknown";
    if (field === "diameterMm") return `${v} mm`;
    if (field === "material") return v === "pvc" || v === "hdpe" ? String(v).toUpperCase() : titleCase(String(v));
    if (field === "installedAt" || field === "lastInspectedAt") return formatDate(String(v));
    if (field === "location" && typeof v === "object") return formatCoords(v as { lat: number; lng: number });
    if (Array.isArray(v)) return `${v.length} ${field === "path" || field === "boundary" ? "points" : v.length === 1 ? "item" : "items"}`;
    return String(v);
}

export const MODE_LABEL: Record<MergeMode, string> = {
    create: "New",
    "fast-forward": "Updated",
    merge: "Updated, merged with newer edits",
    delete: "Deleted",
    restore: "Restored",
};

export const SKIP_LABEL: Record<SkipReason, string> = {
    "created-and-deleted-on-branch": "Added and removed again",
    "no-change": "Already matches the live network",
    "kept-main": "Live network version kept",
};

export const conflictsOf = (e: ReviewEntity): FieldConflict[] => (e.plan.kind === "conflict" ? e.plan.conflicts : []);

export function summarize(b: ReviewBranch) {
    const conflicts = b.entities.filter((e) => e.plan.kind === "conflict").length;
    const ready = b.entities.filter((e) => e.plan.kind === "write").length;
    const unchanged = b.entities.filter((e) => e.plan.kind === "skip").length;
    return { conflicts, ready, unchanged, total: b.entities.length };
}

export const initialsOf = (name: string) => name.split(/[\s.]+/).filter(Boolean).map((p) => p[0]!.toUpperCase()).slice(0, 2).join("");

export function formatRange(firstIso: string, lastIso: string): string {
    const a = new Date(firstIso);
    const b = new Date(lastIso);
    const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const sameDay = (x: Date, y: Date) => x.toDateString() === y.toDateString();
    const day = sameDay(b, new Date()) ? "Today" : b.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return sameDay(a, b) ? `${day}, ${time(a)} to ${time(b)}` : `${a.toLocaleDateString(undefined, { day: "numeric", month: "short" })} to ${day}`;
}

/* ---------- mock engine, standing in for reconcile.post ---------- */

export function simulatePost(b: ReviewBranch, resolutions: Resolutions): PostResult {
    const unresolved = b.entities.some((e) => conflictsOf(e).some((c) => !resolutions[e.id]?.[c.field]));
    if (unresolved) return { status: "conflicts" };

    const violations: Violation[] = b.entities
        .filter((e) => e.mockViolation && e.plan.kind === "write")
        .map((e) => ({ code: "dma-inlet-missing", entityId: e.id, relatedId: e.id, message: e.mockViolation! }));
    if (violations.length) return { status: "invalid", violations };

    const s: PostSummary = { created: 0, fastForwarded: 0, merged: 0, deleted: 0, restored: 0, skipped: 0 };
    for (const e of b.entities) {
        if (e.plan.kind === "skip") s.skipped++;
        else if (e.plan.kind === "conflict") {
            const existence = resolutions[e.id]?.[EXISTENCE_FIELD];
            if (existence) existence === "branch" ? (e.plan.conflicts[0]?.branch === "deleted" ? s.deleted++ : s.restored++) : s.skipped++;
            else s.merged++;
        } else if (e.plan.mode === "create") s.created++;
        else if (e.plan.mode === "fast-forward") s.fastForwarded++;
        else if (e.plan.mode === "merge") s.merged++;
        else if (e.plan.mode === "delete") s.deleted++;
        else s.restored++;
    }
    return { status: "posted", summary: s };
}

/* ---------- mock data ---------- */

const minsAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString();

export const mockBranches: ReviewBranch[] = [
    {
        branch: "p.otieno-2026-10-29",
        authorName: "Peter Otieno",
        firstEditAt: minsAgo(260),
        lastEditAt: minsAgo(95),
        token: "tok-a",
        entities: [
            { id: "n-valve-2", entityType: "node", name: "Valve KLS-02", plan: { kind: "write", mode: "fast-forward", changes: [
                        { field: "condition", from: "fair", to: "poor" },
                        { field: "isOpen", from: true, to: false },
                        { field: "lastInspectedAt", from: minsAgo(60 * 24 * 200), to: minsAgo(95) },
                    ] } },
            { id: "n-new-1", entityType: "node", name: "Junction J-16", plan: { kind: "write", mode: "create", changes: [
                        { field: "name", from: null, to: "Junction J-16" },
                        { field: "location", from: null, to: { lat: -1.2931, lng: 36.7855 } },
                        { field: "condition", from: null, to: "good" },
                    ] } },
            { id: "p-8", entityType: "pipe", name: "Pipe p-8", plan: { kind: "write", mode: "fast-forward", changes: [{ field: "material", from: "pvc", to: "hdpe" }] } },
        ],
    },
    {
        branch: "j.mwangi-2026-10-28",
        authorName: "J. Mwangi",
        firstEditAt: minsAgo(60 * 30),
        lastEditAt: minsAgo(60 * 26),
        token: "tok-b",
        entities: [
            { id: "n-hyd-1", entityType: "node", name: "Hydrant H-07", plan: { kind: "conflict", conflicts: [{ field: "condition", base: "poor", branch: "critical", main: "good" }] } },
            { id: "n-junc-2", entityType: "node", name: "Junction J-15", plan: { kind: "conflict", conflicts: [{ field: EXISTENCE_FIELD, base: "present", branch: "deleted", main: "edited" }] } },
            { id: "s-man-1", entityType: "structure", name: "Manhole MH-12", plan: { kind: "write", mode: "merge", changes: [{ field: "condition", from: "fair", to: "poor" }] } },
            { id: "n-meter-1", entityType: "node", name: "Bulk Meter M-22", mockViolation: "DMA Kileleshwa South would have inlet meter Bulk Meter M-22, which doesn't exist on the live network.", plan: { kind: "write", mode: "delete", changes: [] } },
            { id: "n-valve-1", entityType: "node", name: "Valve KLS-01", plan: { kind: "skip", reason: "no-change" } },
        ],
    },
];