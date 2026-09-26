import type {
    NetworkNode,
    Pipe,
    User,
    ValveStateLog,
    ConditionLog,
} from "@majimap/shared-types";

// Roughly the Kilimani / Kileleshwa area of Nairobi — used as a plausible
// service zone for demo purposes, not a real utility's actual network.
export const CENTER = { lat: -1.2921, lng: 36.7819 };

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const hoursAgo = (n: number) => new Date(Date.now() - n * 3600000).toISOString();

export const mockUsers: User[] = [
    {
        id: "u-admin-1",
        name: "Wanjiru Kamau",
        email: "wanjiru.kamau@nairobiwater.example",
        username: null,
        role: "admin",
        isActive: true,
        lastSyncedAt: hoursAgo(1),
        createdAt: daysAgo(400),
    },
    {
        id: "u-eng-1",
        name: "Otieno Ochieng",
        email: "otieno.ochieng@nairobiwater.example",
        username: null,
        role: "gis_engineer",
        isActive: true,
        lastSyncedAt: hoursAgo(3),
        createdAt: daysAgo(300),
    },
    {
        id: "u-tech-1",
        name: "Achieng Odhiambo",
        email: null,
        username: "a.odhiambo",
        role: "field_technician",
        isActive: true,
        lastSyncedAt: hoursAgo(18),
        createdAt: daysAgo(220),
    },
    {
        id: "u-tech-2",
        name: "Kiptoo Rono",
        email: null,
        username: "k.rono",
        role: "field_technician",
        isActive: true,
        lastSyncedAt: hoursAgo(80),
        createdAt: daysAgo(180),
    },
    {
        id: "u-tech-3",
        name: "Njeri Mwangi",
        email: null,
        username: "n.mwangi",
        role: "field_technician",
        isActive: true,
        lastSyncedAt: hoursAgo(170),
        createdAt: daysAgo(150),
    },
    {
        id: "u-view-1",
        name: "County Ops Viewer",
        email: "ops.viewer@county.example",
        username: null,
        role: "viewer",
        isActive: true,
        lastSyncedAt: daysAgo(2),
        createdAt: daysAgo(90),
    },
    {
        id: "u-tech-4",
        name: "Brian Mutiso",
        email: null,
        username: "b.mutiso",
        role: "field_technician",
        isActive: false,
        lastSyncedAt: daysAgo(45),
        createdAt: daysAgo(260),
    },
];

// Offsets in degrees (~roughly 100–250m apart) laid out as a ring with one
// branch, so the trace demo has an actual cycle to protect against.
export const mockNodes: NetworkNode[] = [
    { id: "n-res-1", type: "reservoir", name: "Kileleshwa Reservoir", location: { lat: CENTER.lat + 0.010, lng: CENTER.lng - 0.004 }, condition: "good", isOpen: null, installedAt: daysAgo(3600), lastInspectedAt: daysAgo(30) },
    { id: "n-pump-1", type: "pumping_station", name: "Kileleshwa Booster PS", location: { lat: CENTER.lat + 0.007, lng: CENTER.lng - 0.002 }, condition: "good", isOpen: null, installedAt: daysAgo(3200), lastInspectedAt: daysAgo(14) },
    { id: "n-valve-1", type: "valve", name: "Valve KLS-01", location: { lat: CENTER.lat + 0.004, lng: CENTER.lng }, condition: "good", isOpen: true, installedAt: daysAgo(2800), lastInspectedAt: daysAgo(60) },
    { id: "n-junc-1", type: "junction", name: "Junction J-14", location: { lat: CENTER.lat + 0.001, lng: CENTER.lng + 0.002 }, condition: "fair", isOpen: null, installedAt: daysAgo(2800), lastInspectedAt: daysAgo(90) },
    { id: "n-valve-2", type: "valve", name: "Valve KLS-02", location: { lat: CENTER.lat - 0.002, lng: CENTER.lng + 0.004 }, condition: "fair", isOpen: true, installedAt: daysAgo(2600), lastInspectedAt: daysAgo(200) },
    { id: "n-hyd-1", type: "hydrant", name: "Hydrant H-07", location: { lat: CENTER.lat - 0.001, lng: CENTER.lng + 0.006 }, condition: "poor", isOpen: null, installedAt: daysAgo(2400), lastInspectedAt: daysAgo(400) },
    { id: "n-junc-2", type: "junction", name: "Junction J-15", location: { lat: CENTER.lat - 0.005, lng: CENTER.lng + 0.003 }, condition: "good", isOpen: null, installedAt: daysAgo(2400), lastInspectedAt: daysAgo(45) },
    { id: "n-meter-1", type: "meter", name: "Bulk Meter M-22", location: { lat: CENTER.lat - 0.006, lng: CENTER.lng + 0.001 }, condition: "good", isOpen: null, installedAt: daysAgo(1900), lastInspectedAt: daysAgo(20) },
    { id: "n-valve-3", type: "valve", name: "Valve KLS-03", location: { lat: CENTER.lat - 0.008, lng: CENTER.lng - 0.001 }, condition: "critical", isOpen: false, installedAt: daysAgo(1900), lastInspectedAt: daysAgo(500) },
    { id: "n-junc-3", type: "junction", name: "Junction J-16", location: { lat: CENTER.lat - 0.006, lng: CENTER.lng - 0.004 }, condition: "fair", isOpen: null, installedAt: daysAgo(1700), lastInspectedAt: daysAgo(70) },
    { id: "n-hyd-2", type: "hydrant", name: "Hydrant H-08", location: { lat: CENTER.lat - 0.003, lng: CENTER.lng - 0.006 }, condition: "good", isOpen: null, installedAt: daysAgo(1700), lastInspectedAt: daysAgo(10) },
    { id: "n-valve-4", type: "valve", name: "Valve KLS-04", location: { lat: CENTER.lat, lng: CENTER.lng - 0.006 }, condition: "good", isOpen: true, installedAt: daysAgo(1500), lastInspectedAt: daysAgo(33) },
    { id: "n-junc-4", type: "junction", name: "Junction J-17", location: { lat: CENTER.lat + 0.003, lng: CENTER.lng - 0.005 }, condition: "good", isOpen: null, installedAt: daysAgo(1500), lastInspectedAt: daysAgo(15) },
    // Branch off the ring, terminating at a dead-end meter + hydrant.
    { id: "n-valve-5", type: "valve", name: "Valve KLS-05 (branch)", location: { lat: CENTER.lat - 0.001, lng: CENTER.lng - 0.001 }, condition: "fair", isOpen: true, installedAt: daysAgo(1200), lastInspectedAt: daysAgo(100) },
    { id: "n-meter-2", type: "meter", name: "Bulk Meter M-23", location: { lat: CENTER.lat - 0.003, lng: CENTER.lng }, condition: "poor", isOpen: null, installedAt: daysAgo(1200), lastInspectedAt: daysAgo(310) },
    { id: "n-hyd-3", type: "hydrant", name: "Hydrant H-09", location: { lat: CENTER.lat - 0.004, lng: CENTER.lng + 0.001 }, condition: "unknown", isOpen: null, installedAt: daysAgo(900), lastInspectedAt: null },
    { id: "n-pump-2", type: "pumping_station", name: "Riverside Booster PS", location: { lat: CENTER.lat + 0.002, lng: CENTER.lng + 0.005 }, condition: "fair", isOpen: null, installedAt: daysAgo(2000), lastInspectedAt: daysAgo(50) },
];

const pipe = (
    id: string,
    fromNodeId: string,
    toNodeId: string,
    material: Pipe["material"],
    diameterMm: number,
    condition: Pipe["condition"],
): Pipe => {
    const from = mockNodes.find((n) => n.id === fromNodeId)!;
    const to = mockNodes.find((n) => n.id === toNodeId)!;
    const dLat = (to.location.lat - from.location.lat) * 111_000;
    const dLng = (to.location.lng - from.location.lng) * 111_000 * Math.cos((from.location.lat * Math.PI) / 180);
    const lengthM = Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
    return {
        id,
        fromNodeId,
        toNodeId,
        path: [from.location, to.location],
        material,
        diameterMm,
        condition,
        lengthM,
    };
};

export const mockPipes: Pipe[] = [
    pipe("p-1", "n-res-1", "n-pump-1", "ductile_iron", 400, "good"),
    pipe("p-2", "n-pump-1", "n-valve-1", "ductile_iron", 350, "good"),
    pipe("p-3", "n-valve-1", "n-junc-1", "hdpe", 300, "fair"),
    pipe("p-4", "n-junc-1", "n-pump-2", "hdpe", 250, "fair"),
    pipe("p-5", "n-pump-2", "n-valve-2", "hdpe", 250, "good"),
    pipe("p-6", "n-valve-2", "n-hyd-1", "pvc", 150, "poor"),
    pipe("p-7", "n-valve-2", "n-junc-2", "hdpe", 200, "good"),
    pipe("p-8", "n-junc-2", "n-meter-1", "pvc", 150, "good"),
    pipe("p-9", "n-junc-2", "n-valve-3", "hdpe", 200, "critical"),
    pipe("p-10", "n-valve-3", "n-junc-3", "hdpe", 200, "fair"),
    pipe("p-11", "n-junc-3", "n-hyd-2", "pvc", 150, "good"),
    pipe("p-12", "n-junc-3", "n-valve-4", "hdpe", 250, "good"),
    pipe("p-13", "n-valve-4", "n-junc-4", "hdpe", 250, "good"),
    pipe("p-14", "n-junc-4", "n-valve-1", "ductile_iron", 300, "good"), // closes the ring back to KLS-01
    pipe("p-15", "n-junc-1", "n-valve-5", "pvc", 150, "fair"), // branch
    pipe("p-16", "n-valve-5", "n-meter-2", "pvc", 100, "poor"),
    pipe("p-17", "n-valve-5", "n-hyd-3", "pvc", 100, "unknown"),
];

export const mockValveStateLogs: ValveStateLog[] = [
    { id: "vsl-1", nodeId: "n-valve-3", isOpen: false, changedAt: daysAgo(2), changedByUserId: "u-tech-2", syncedAt: daysAgo(1) },
    { id: "vsl-2", nodeId: "n-valve-3", isOpen: true, changedAt: daysAgo(40), changedByUserId: "u-tech-1", syncedAt: daysAgo(40) },
    { id: "vsl-3", nodeId: "n-valve-1", isOpen: true, changedAt: daysAgo(60), changedByUserId: "u-eng-1", syncedAt: daysAgo(60) },
    { id: "vsl-4", nodeId: "n-valve-5", isOpen: true, changedAt: daysAgo(100), changedByUserId: "u-tech-3", syncedAt: daysAgo(99) },
];

export const mockConditionLogs: ConditionLog[] = [
    { id: "cl-1", nodeId: "n-valve-3", pipeId: null, condition: "critical", note: "Stem badly corroded, leaking at gland. Needs replacement.", recordedAt: daysAgo(2), recordedByUserId: "u-tech-2", syncedAt: daysAgo(1) },
    { id: "cl-2", nodeId: null, pipeId: "p-9", condition: "critical", note: "Visible seepage along joint near valve KLS-03.", recordedAt: daysAgo(3), recordedByUserId: "u-tech-2", syncedAt: daysAgo(1) },
    { id: "cl-3", nodeId: "n-hyd-1", pipeId: null, condition: "poor", note: "Cap missing, thread damaged.", recordedAt: daysAgo(9), recordedByUserId: "u-tech-1", syncedAt: daysAgo(8) },
    { id: "cl-4", nodeId: null, pipeId: "p-16", condition: "poor", note: "Section exposed after roadworks, no bedding.", recordedAt: daysAgo(12), recordedByUserId: "u-tech-3", syncedAt: daysAgo(10) },
    { id: "cl-5", nodeId: "n-meter-2", pipeId: null, condition: "poor", note: "Reading inconsistent with billing, suspected under-registration.", recordedAt: daysAgo(15), recordedByUserId: "u-tech-3", syncedAt: daysAgo(10) },
    { id: "cl-6", nodeId: "n-junc-1", pipeId: null, condition: "fair", note: "Minor settlement around chamber cover.", recordedAt: daysAgo(20), recordedByUserId: "u-eng-1", syncedAt: daysAgo(20) },
    { id: "cl-7", nodeId: "n-res-1", pipeId: null, condition: "good", note: "Routine inspection, no issues.", recordedAt: daysAgo(30), recordedByUserId: "u-eng-1", syncedAt: daysAgo(30) },
];

/** 6-month condition trend used by the reports dashboard chart. */
export const conditionTrend = [
    { month: "Apr", good: 9, fair: 5, poor: 2, critical: 1 },
    { month: "May", good: 9, fair: 5, poor: 2, critical: 1 },
    { month: "Jun", good: 8, fair: 5, poor: 3, critical: 1 },
    { month: "Jul", good: 8, fair: 4, poor: 3, critical: 2 },
    { month: "Aug", good: 8, fair: 4, poor: 3, critical: 2 },
    { month: "Sep", good: 7, fair: 5, poor: 3, critical: 2 },
];

export function getNode(id: string) {
    return mockNodes.find((n) => n.id === id);
}

/**
 * Zones are hand-drawn service-area boundaries (not part of the core
 * shared-types package yet — kept local until the backend model exists).
 * `ring` is a closed polygon: first point must equal the last.
 */
export type Zone = {
    id: string;
    name: string;
    color: string;
    ring: { lat: number; lng: number }[];
};

export const ZONE_COLORS = ["#3B82F6", "#A855F7", "#F59E0B", "#EC4899", "#10B981", "#64748B"];

export const mockZones: Zone[] = [
    {
        id: "zone-1",
        name: "Zone 1",
        color: ZONE_COLORS[0],
        ring: [
            { lat: -1.2800, lng: 36.7750 },
            { lat: -1.2800, lng: 36.7895 },
            { lat: -1.2965, lng: 36.7895 },
            { lat: -1.2965, lng: 36.7750 },
            { lat: -1.2800, lng: 36.7750 },
        ],
    },
    {
        id: "zone-2",
        name: "Zone 2",
        color: ZONE_COLORS[1],
        ring: [
            { lat: -1.2965, lng: 36.7740 },
            { lat: -1.2965, lng: 36.7830 },
            { lat: -1.3040, lng: 36.7830 },
            { lat: -1.3040, lng: 36.7740 },
            { lat: -1.2965, lng: 36.7740 },
        ],
    },
];