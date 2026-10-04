import { mockConditionLogs, mockNodes, mockPipes, mockDmas } from "@/lib/mock-data";
import type { NetworkNode } from "@majimap/shared-types";

export type AlertSeverity = "critical" | "warning";

export type Alert = {
    id: string;
    severity: AlertSeverity;
    title: string;
    description: string;
    href: string;
    occurredAt: string;
};

/**
 * There's no real alerting/notification system yet — this derives alerts
 * from signals that already exist (condition logs, DMA boundary state)
 * rather than introducing a persisted Alert entity nothing can write to
 * yet. Becomes a real query once a notifications concern exists in the
 * shared core.
 */
export function computeAlerts(): Alert[] {
    const conditionAlerts: Alert[] = mockConditionLogs
        .filter((l) => l.condition === "critical" || l.condition === "poor")
        .map((l) => {
            const node = l.nodeId ? mockNodes.find((n) => n.id === l.nodeId) : null;
            const pipe = l.pipeId ? mockPipes.find((p) => p.id === l.pipeId) : null;
            const name = node?.name ?? (pipe ? `Pipe ${pipe.id}` : "Unknown asset");
            const assetId = node?.id ?? pipe?.id;
            return {
                id: `alert-${l.id}`,
                severity: (l.condition === "critical" ? "critical" : "warning") as AlertSeverity,
                title: `${name} logged as ${l.condition}`,
                description: l.note ?? "No note recorded.",
                href: assetId ? `/assets/${assetId}` : "/assets",
                occurredAt: l.recordedAt,
            };
        });

    const dmaAlerts: Alert[] = mockDmas.flatMap((dma) => {
        const openValves = dma.boundaryValveIds
            .map((id) => mockNodes.find((n) => n.id === id))
            .filter((n): n is NetworkNode => !!n && n.isOpen === true);
        if (openValves.length === 0) return [];
        return [{
            id: `alert-dma-${dma.id}`,
            severity: "critical" as AlertSeverity,
            title: `${dma.name}: ${openValves.length} boundary valve${openValves.length === 1 ? "" : "s"} open`,
            description: `${openValves.map((v) => v.name).join(", ")} should be closed to keep this DMA isolated.`,
            href: `/dmas/${dma.id}`,
            occurredAt: new Date().toISOString(),
        }];
    });

    return [...conditionAlerts, ...dmaAlerts].sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
        return +new Date(b.occurredAt) - +new Date(a.occurredAt);
    });
}