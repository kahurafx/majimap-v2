"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BasicTable, type BasicTableColumn } from "@/components/tables/basic-table";
import { mockDmas, mockNodes, mockTiers } from "@/lib/mock-data";
import { traceSubnetworkMembership } from "@/lib/network-graph";
import type { Dma } from "@majimap/shared-types";

function tierName(tierId: string) {
    return mockTiers.find((t) => t.id === tierId)?.name ?? "Unknown";
}

const columns: BasicTableColumn<Dma>[] = [
    {
        key: "name",
        header: "Name",
        render: (d) => (
            <Link href={`/dmas/${d.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                {d.name}
            </Link>
        ),
    },
    { key: "tier", header: "Tier", render: (d) => <span className="text-muted-foreground">{tierName(d.tierId)}</span> },
    {
        key: "inlet",
        header: "Inlet meter",
        render: (d) => {
            const meter = mockNodes.find((n) => n.id === d.inletMeterId);
            return <span className="text-muted-foreground">{meter?.name ?? "Unknown"}</span>;
        },
    },
    {
        key: "boundary",
        header: "Boundary valves",
        render: (d) => {
            const openCount = d.boundaryValveIds.filter((id) => mockNodes.find((n) => n.id === id)?.isOpen === true).length;
            return (
                <div className="flex items-center gap-1.5">
                    <span className="font-data text-muted-foreground">{d.boundaryValveIds.length}</span>
                    {openCount > 0 && (
                        <Badge variant="destructive" className="gap-1 text-[10px]">
                            <AlertTriangle className="h-3 w-3" /> {openCount} open
                        </Badge>
                    )}
                </div>
            );
        },
    },
    {
        key: "members",
        header: "Traced members",
        render: (d) => (
            <span className="font-data text-muted-foreground">
                {traceSubnetworkMembership(d.inletMeterId, mockNodes, []).length}
            </span>
        ),
    },
];

export default function DmasPage() {
    return (
        <>
            <Topbar title="DMAs" />
            <main className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex max-w-6xl flex-col gap-4">
                    <p className="text-sm text-muted-foreground">
                        {mockDmas.length} district metered area{mockDmas.length === 1 ? "" : "s"}. NRW per zone will show
                        here once billing data exists — this table already reflects real network topology, not just drawn
                        boundaries.
                    </p>
                    <Card>
                        <CardContent className="pt-4">
                            <BasicTable columns={columns} rows={mockDmas} getRowKey={(d) => d.id} emptyMessage="No DMAs drawn yet — draw one from the map." />
                        </CardContent>
                    </Card>
                </div>
            </main>
        </>
    );
}