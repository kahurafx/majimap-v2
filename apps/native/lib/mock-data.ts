import type { NetworkNode } from "@majimap/shared-types";

export const CENTER = { lat: -1.2921, lng: 36.7819 };
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const mockNodes: NetworkNode[] = [
    { id: "n-res-1", type: "reservoir", name: "Kileleshwa Reservoir", location: { lat: CENTER.lat + 0.01, lng: CENTER.lng - 0.004 }, condition: "good", isOpen: null, installedAt: daysAgo(3600), lastInspectedAt: daysAgo(30) },
    { id: "n-pump-1", type: "pumping_station", name: "Kileleshwa Booster PS", location: { lat: CENTER.lat + 0.007, lng: CENTER.lng - 0.002 }, condition: "good", isOpen: null, installedAt: daysAgo(3200), lastInspectedAt: daysAgo(14) },
    { id: "n-valve-1", type: "valve", name: "Valve KLS-01", location: { lat: CENTER.lat + 0.004, lng: CENTER.lng }, condition: "good", isOpen: true, installedAt: daysAgo(2800), lastInspectedAt: daysAgo(60) },
    { id: "n-junc-1", type: "junction", name: "Junction J-14", location: { lat: CENTER.lat + 0.001, lng: CENTER.lng + 0.002 }, condition: "fair", isOpen: null, installedAt: daysAgo(2800), lastInspectedAt: daysAgo(90) },
    { id: "n-valve-2", type: "valve", name: "Valve KLS-02", location: { lat: CENTER.lat - 0.002, lng: CENTER.lng + 0.004 }, condition: "fair", isOpen: true, installedAt: daysAgo(2600), lastInspectedAt: daysAgo(200) },
    { id: "n-hyd-1", type: "hydrant", name: "Hydrant H-07", location: { lat: CENTER.lat - 0.001, lng: CENTER.lng + 0.006 }, condition: "poor", isOpen: null, installedAt: daysAgo(2400), lastInspectedAt: daysAgo(400) },
    { id: "n-junc-2", type: "junction", name: "Junction J-15", location: { lat: CENTER.lat - 0.005, lng: CENTER.lng + 0.003 }, condition: "good", isOpen: null, installedAt: daysAgo(2400), lastInspectedAt: daysAgo(45) },
    { id: "n-meter-1", type: "meter", name: "Bulk Meter M-22", location: { lat: CENTER.lat - 0.006, lng: CENTER.lng + 0.001 }, condition: "good", isOpen: null, installedAt: daysAgo(1900), lastInspectedAt: daysAgo(20) },
    { id: "n-valve-3", type: "valve", name: "Valve KLS-03", location: { lat: CENTER.lat - 0.008, lng: CENTER.lng - 0.001 }, condition: "critical", isOpen: false, installedAt: daysAgo(1900), lastInspectedAt: daysAgo(500) },
];