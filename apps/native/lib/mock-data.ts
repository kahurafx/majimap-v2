import { approxMetres } from "./assets";
import type { Condition, Dma, NetworkNode, Pipe, Structure, Subnetwork } from "@majimap/shared-types";

export const CENTER = { lat: -1.2921, lng: 36.7819 };

const minsAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const mockOrg = { id: "org-1", name: "Kileleshwa Water & Sewerage", slug: "kwsc" };
export const mockUser = { id: "u-1", name: "Denis Kahura", username: "a.odhiambo" };

export const mockStructures: Structure[] = [
    { id: "s-man-1", type: "manhole", name: "Manhole MH-12", location: { lat: CENTER.lat - 0.002, lng: CENTER.lng + 0.004 }, condition: "fair", installedAt: daysAgo(2600), lastInspectedAt: daysAgo(200) },
    { id: "s-ch-1", type: "chamber", name: "Meter chamber MC-03", location: { lat: CENTER.lat - 0.006, lng: CENTER.lng + 0.001 }, condition: "good", installedAt: daysAgo(1900), lastInspectedAt: daysAgo(20) },
    { id: "s-vault-1", type: "vault", name: "Valve vault VV-01", location: { lat: CENTER.lat + 0.004, lng: CENTER.lng }, condition: "good", installedAt: daysAgo(2800), lastInspectedAt: daysAgo(60) },
];

export const mockNodes: NetworkNode[] = [
    { id: "n-res-1", type: "reservoir", name: "Kileleshwa Reservoir", location: { lat: CENTER.lat + 0.01, lng: CENTER.lng - 0.004 }, condition: "good", isOpen: null, installedAt: daysAgo(3600), lastInspectedAt: daysAgo(30), structureId: null },
    { id: "n-pump-1", type: "pumping_station", name: "Kileleshwa Booster PS", location: { lat: CENTER.lat + 0.007, lng: CENTER.lng - 0.002 }, condition: "good", isOpen: null, installedAt: daysAgo(3200), lastInspectedAt: daysAgo(14), structureId: null },
    { id: "n-valve-1", type: "valve", name: "Valve KLS-01", location: { lat: CENTER.lat + 0.004, lng: CENTER.lng }, condition: "good", isOpen: true, installedAt: daysAgo(2800), lastInspectedAt: daysAgo(60), structureId: "s-vault-1" },
    { id: "n-junc-1", type: "junction", name: "Junction J-14", location: { lat: CENTER.lat + 0.001, lng: CENTER.lng + 0.002 }, condition: "fair", isOpen: null, installedAt: daysAgo(2800), lastInspectedAt: daysAgo(90), structureId: null },
    { id: "n-valve-2", type: "valve", name: "Valve KLS-02", location: { lat: CENTER.lat - 0.002, lng: CENTER.lng + 0.004 }, condition: "fair", isOpen: true, installedAt: daysAgo(2600), lastInspectedAt: daysAgo(200), structureId: "s-man-1" },
    { id: "n-hyd-1", type: "hydrant", name: "Hydrant H-07", location: { lat: CENTER.lat - 0.001, lng: CENTER.lng + 0.006 }, condition: "poor", isOpen: null, installedAt: daysAgo(2400), lastInspectedAt: daysAgo(400), structureId: null },
    { id: "n-junc-2", type: "junction", name: "Junction J-15", location: { lat: CENTER.lat - 0.005, lng: CENTER.lng + 0.003 }, condition: "good", isOpen: null, installedAt: daysAgo(2400), lastInspectedAt: daysAgo(45), structureId: null },
    { id: "n-meter-1", type: "meter", name: "Bulk Meter M-22", location: { lat: CENTER.lat - 0.006, lng: CENTER.lng + 0.001 }, condition: "good", isOpen: null, installedAt: daysAgo(1900), lastInspectedAt: daysAgo(20), structureId: "s-ch-1" },
    { id: "n-valve-3", type: "valve", name: "Valve KLS-03", location: { lat: CENTER.lat - 0.008, lng: CENTER.lng - 0.001 }, condition: "critical", isOpen: false, installedAt: daysAgo(1900), lastInspectedAt: daysAgo(500), structureId: null },
];

const byId = (id: string) => mockNodes.find((n) => n.id === id)!;
const pipe = (id: string, from: string, to: string, material: Pipe["material"], diameterMm: number, condition: Condition): Pipe => {
    const path = [byId(from).location, byId(to).location];
    return { id, fromNodeId: from, toNodeId: to, path, material, diameterMm, condition, lengthM: Math.round(approxMetres(path[0]!, path[1]!)) };
};

export const mockPipes: Pipe[] = [
    pipe("p-1", "n-res-1", "n-pump-1", "ductile_iron", 300, "good"),
    pipe("p-2", "n-pump-1", "n-valve-1", "ductile_iron", 300, "good"),
    pipe("p-3", "n-valve-1", "n-junc-1", "ductile_iron", 250, "fair"),
    pipe("p-4", "n-junc-1", "n-valve-2", "pvc", 200, "fair"),
    pipe("p-5", "n-valve-2", "n-junc-2", "pvc", 200, "good"),
    pipe("p-6", "n-junc-2", "n-meter-1", "hdpe", 150, "good"),
    pipe("p-7", "n-meter-1", "n-valve-3", "hdpe", 150, "poor"),
    pipe("p-8", "n-valve-2", "n-hyd-1", "pvc", 100, "poor"),
];

/** UI-level history rows. The API's log DTOs carry user ids; the real app will join names. */
export type InspectionEntry = { id: string; assetId: string; condition: Condition; note: string | null; recordedAt: string; recordedByName: string };
export type ValveEntry = { id: string; valveId: string; isOpen: boolean; changedAt: string; changedByName: string; note: string | null };

export const mockInspections: InspectionEntry[] = [
    { id: "i-1", assetId: "n-pump-1", condition: "good", note: "Vibration normal, no leaks at the seals.", recordedAt: daysAgo(14), recordedByName: "J. Mwangi" },
    { id: "i-2", assetId: "n-meter-1", condition: "good", note: "Reading matches the bulk meter log.", recordedAt: daysAgo(20), recordedByName: "Amina Odhiambo" },
    { id: "i-3", assetId: "n-res-1", condition: "good", note: "Level gauge OK. Roof hatch locked.", recordedAt: daysAgo(30), recordedByName: "J. Mwangi" },
    { id: "i-4", assetId: "n-junc-2", condition: "good", note: null, recordedAt: daysAgo(45), recordedByName: "Amina Odhiambo" },
    { id: "i-5", assetId: "n-junc-1", condition: "fair", note: "Surface rust on the flange.", recordedAt: daysAgo(90), recordedByName: "J. Mwangi" },
    { id: "i-6", assetId: "n-valve-2", condition: "fair", note: "Stiff to turn. Needs greasing.", recordedAt: daysAgo(200), recordedByName: "P. Otieno" },
    { id: "i-7", assetId: "n-hyd-1", condition: "poor", note: "Cap corroded, leaking at the outlet.", recordedAt: daysAgo(400), recordedByName: "P. Otieno" },
    { id: "i-8", assetId: "n-valve-3", condition: "critical", note: "Spindle seized. Will not close fully.", recordedAt: daysAgo(500), recordedByName: "J. Mwangi" },
    { id: "i-9", assetId: "n-valve-3", condition: "fair", note: null, recordedAt: daysAgo(700), recordedByName: "P. Otieno" },
];

export const mockValveLogs: ValveEntry[] = [
    { id: "v-1", valveId: "n-valve-1", isOpen: true, changedAt: daysAgo(60), changedByName: "J. Mwangi", note: "Reopened after flushing." },
    { id: "v-2", valveId: "n-valve-2", isOpen: true, changedAt: daysAgo(200), changedByName: "P. Otieno", note: null },
    { id: "v-3", valveId: "n-valve-3", isOpen: false, changedAt: daysAgo(500), changedByName: "J. Mwangi", note: "Closed to isolate the leak on the 150 mm main." },
];

/**
 * How the server's `Outcome` (applied / unchanged / stale / replayed) plus the
 * device-side states (queued / failed) show up in the Sync screen.
 */
export type SyncStatus = "queued" | "failed" | "applied" | "unchanged" | "stale" | "replayed";

export type SyncItem = {
    id: string;
    kind: "condition" | "valve" | "create" | "workorder";
    assetId: string | null;
    title: string;
    assetName: string;
    detail: string;
    at: string;
    status: SyncStatus;
    error?: string;
    /** An engineer has already posted this branch to main. */
    reviewed?: boolean;
};

export const mockQueue: SyncItem[] = [
    { id: "q-1", kind: "condition", assetId: "n-hyd-1", title: "Inspection", assetName: "Hydrant H-07", detail: "Poor", at: minsAgo(95), status: "queued" },
    { id: "q-2", kind: "valve", assetId: "n-valve-2", title: "Valve operated", assetName: "Valve KLS-02", detail: "Closed", at: minsAgo(140), status: "queued" },
    { id: "q-3", kind: "create", assetId: null, title: "New junction", assetName: "Junction J-16", detail: "Added to your changes", at: minsAgo(210), status: "failed", error: "Couldn't reach the server" },
    { id: "h-1", kind: "condition", assetId: "n-pump-1", title: "Inspection", assetName: "Kileleshwa Booster PS", detail: "Good", at: minsAgo(60 * 26), status: "applied", reviewed: true },
    { id: "h-2", kind: "valve", assetId: "n-valve-1", title: "Valve operated", assetName: "Valve KLS-01", detail: "Open", at: minsAgo(60 * 27), status: "applied", reviewed: true },
    { id: "h-3", kind: "condition", assetId: "n-junc-1", title: "Inspection", assetName: "Junction J-14", detail: "Fair", at: minsAgo(60 * 30), status: "stale", reviewed: true },
    { id: "h-4", kind: "condition", assetId: "n-meter-1", title: "Inspection", assetName: "Bulk Meter M-22", detail: "Good", at: minsAgo(60 * 31), status: "unchanged", reviewed: true },
    { id: "h-5", kind: "valve", assetId: "n-valve-3", title: "Valve operated", assetName: "Valve KLS-03", detail: "Closed", at: minsAgo(60 * 33), status: "replayed", reviewed: true },
];

/** Branches waiting for an admin or engineer (reconcile.branches). */
export const MOCK_REVIEW_BRANCHES = 2;

const ring = (latS: number, latN: number, lngW: number, lngE: number) => {
    const pts = [
        { lat: CENTER.lat + latN, lng: CENTER.lng + lngW },
        { lat: CENTER.lat + latN, lng: CENTER.lng + lngE },
        { lat: CENTER.lat + latS, lng: CENTER.lng + lngE },
        { lat: CENTER.lat + latS, lng: CENTER.lng + lngW },
    ];
    return [...pts, pts[0]!];
};

export const mockDmas: Dma[] = [
    { id: "dma-1", name: "Kileleshwa South", color: "#3B82F6", tierId: "tier-dma", inletMeterId: "n-meter-1", boundaryValveIds: ["n-valve-2"], ring: ring(-0.0095, -0.0045, -0.0025, 0.0045) },
];

export const mockSubnetworks: Subnetwork[] = [
    { id: "sn-1", name: "Kileleshwa supply", tierId: "tier-dist", controllerNodeId: "n-res-1", lastValidatedAt: null },
];