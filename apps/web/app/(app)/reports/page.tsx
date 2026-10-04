"use client";

import Link from "next/link";
import { Download, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BasicTable, type BasicTableColumn } from "@/components/tables/basic-table";
import { ConditionTrendChart } from "@/components/dashboard/condition-trend-chart";
import { mockNodes, mockPipes, mockStructures, mockConditionLogs, mockDmas } from "@/lib/mock-data";
import { CONDITION_HEX } from "@/components/condition-badge";

type DmaSummaryRow = {
    id: string;
    name: string;
    inletName: string;
    boundaryValves: number;
    openBoundary: number;
};

const dmaRows: DmaSummaryRow[] = mockDmas.map((d) => {
    const inlet = mockNodes.find((n) => n.id === d.inletMeterId);
    const openBoundary = d.boundaryValveIds.filter((id) => mockNodes.find((n) => n.id === id)?.isOpen === true).length;
    return { id: d.id, name: d.name, inletName: inlet?.name ?? "Unknown", boundaryValves: d.boundaryValveIds.length, openBoundary };
});

const dmaColumns: BasicTableColumn<DmaSummaryRow>[] = [
    { key: "name", header: "DMA", render: (d) => <Link href={`/dmas/${d.id}`} className="font-medium text-foreground hover:text-primary hover:underline">{d.name}</Link> },
    { key: "inlet", header: "Inlet meter", render: (d) => <span className="text-muted-foreground">{d.inletName}</span> },
    { key: "boundary", header: "Boundary valves", render: (d) => <span className="font-data text-muted-foreground">{d.boundaryValves}</span> },
    {
        key: "issues",
        header: "Issues",
        render: (d) =>
            d.openBoundary > 0 ? (
                <Badge variant="destructive" className="gap-1 text-[10px]">
                    <AlertTriangle className="h-3 w-3" /> {d.openBoundary} open
                </Badge>
            ) : (
                <span className="text-xs text-success">Sealed</span>
            ),
    },
    { key: "nrw", header: "NRW", render: () => <span className="text-xs text-muted-foreground">Requires billing module</span> },
];

function monthLabel(iso: string) {
    return new Date(iso).toLocaleString("en-US", { month: "short" });
}

const alertsByMonth = (() => {
    const counts = new Map<string, number>();
    for (const log of mockConditionLogs) {
        if (log.condition !== "poor" && log.condition !== "critical") continue;
        const key = monthLabel(log.recordedAt);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([month, count]) => ({ month, count }));
})();

function downloadInventoryCsv() {
    const header = ["id", "name", "kind", "type", "condition", "installedAt", "lastInspectedAt"];
    const rows = [
        ...mockNodes.map((n) => [n.id, n.name, "node", n.type, n.condition, n.installedAt ?? "", n.lastInspectedAt ?? ""]),
        ...mockStructures.map((s) => [s.id, s.name, "structure", s.type, s.condition, s.installedAt ?? "", s.lastInspectedAt ?? ""]),
        ...mockPipes.map((p) => [p.id, `Pipe ${p.id}`, "pipe", p.material, p.condition, "", ""]),
    ];
    const csv = [header, ...rows]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "asset-inventory.csv";
    a.click();
    URL.revokeObjectURL(url);
}

export default function ReportsPage() {
    return (
        <>
            <Topbar title="Reports" />
            <main className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex max-w-6xl flex-col gap-6">
                    <div className="grid gap-6 lg:grid-cols-2">
                        <ConditionTrendChart />
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base font-semibold text-foreground">Alerts logged over time</CardTitle>
                                <CardDescription>Poor/critical condition logs, by month recorded.</CardDescription>
                            </CardHeader>
                            <CardContent className="h-72 pt-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={alertsByMonth}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                                        <YAxis tickLine={false} axisLine={false} fontSize={12} width={24} allowDecimals={false} />
                                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
                                        <Line type="monotone" dataKey="count" name="Alerts" stroke={CONDITION_HEX.critical} strokeWidth={2} dot={{ r: 3 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base font-semibold text-foreground">DMA summary</CardTitle>
                            <CardDescription>Boundary integrity today — NRW figures need the billing module.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <BasicTable columns={dmaColumns} rows={dmaRows} getRowKey={(d) => d.id} emptyMessage="No DMAs drawn yet." />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base font-semibold text-foreground">Asset inventory export</CardTitle>
                            <CardDescription>
                                {mockNodes.length} nodes · {mockPipes.length} pipes · {mockStructures.length} structures
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button onClick={downloadInventoryCsv}>
                                <Download className="h-4 w-4" /> Export CSV
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </>
    );
}