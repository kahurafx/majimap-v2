const hoursAgo = (n: number) => new Date(Date.now() - n * 3600000).toISOString();

export type PendingChange = {
    id: string;
    summary: string;
    authorId: string;
    branch: string;
    createdAt: string;
};

/**
 * Stand-in for the real reconcile/post queue — once branch versioning
 * exists in packages/db, this becomes a real query instead of a fixture.
 * Kept local to web, not shared-types, for the same reason Zone stayed
 * local before it became Dma: no real backend concept behind it yet.
 */

export const mockPendingChanges: PendingChange[] = [
    { id: "pc-1", summary: "Closed Valve KLS-03 during leak repair", authorId: "u-tech-2", branch: "field-sync-k.rono", createdAt: hoursAgo(5) },
    { id: "pc-2", summary: "Added Meter Kiosk K-09 to the network", authorId: "u-eng-1", branch: "default", createdAt: hoursAgo(20) },
    { id: "pc-3", summary: "Updated Zone 1 boundary valve assignments", authorId: "u-eng-1", branch: "default", createdAt: hoursAgo(26) },
];