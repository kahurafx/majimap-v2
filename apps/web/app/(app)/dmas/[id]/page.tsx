import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConditionBadge } from "@/components/condition-badge";
import { BasicTable, type BasicTableColumn } from "@/components/tables/basic-table";
import { mockDmas, mockNodes, mockPipes, mockTiers } from "@/lib/mock-data";
import { traceSubnetworkMembership } from "@/lib/network-graph";
import type { NetworkNode } from "@majimap/shared-types";

const memberColumns: BasicTableColumn<NetworkNode>[] = [
    {
        key: "name",
        header: "Name",
        render: (n) => (
            <Link href={`/assets/${n.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                {n.name}
            </Link>
        ),
    },
    { key: "type", header: "Type", render: (n) => <span className="capitalize text-muted-foreground">{n.type.replace("_", " ")}</span> },
    { key: "condition", header: "Condition", render: (n) => <ConditionBadge condition={n.condition} /> },
];

const boundaryValveColumns: BasicTableColumn<NetworkNode>[] = [
    {
        key: "name",
        header: "Valve",
        render: (n) => (
            <Link href={`/assets/${n.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                {n.name}
            </Link>
        ),
    },
    {
        key: "state",
        header: "State",
        render: (n) =>
            n.isOpen ? (
                <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> Open — isolation failure
                </Badge>
            ) : (
                <span className="text-success font-medium">Closed</span>
            ),
    },
];

export default async function DmaDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const dma = mockDmas.find((d) => d.id === id);
    if (!dma) notFound();

    const tier = mockTiers.find((t) => t.id === dma.tierId);
    const inletMeter = mockNodes.find((n) => n.id === dma.inletMeterId);
    const boundaryValves = dma.boundaryValveIds.map((vid) => mockNodes.find((n) => n.id === vid)).filter((n): n is NetworkNode => !!n);
    const members = traceSubnetworkMembership(dma.inletMeterId, mockNodes, mockPipes);
    const openBoundaryCount = boundaryValves.filter((v) => v.isOpen === true).length;

    return (
        <>
            <Topbar title={dma.name} />
            <main className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex max-w-6xl flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="sm" className="w-fit" render={<Link href="/dmas" />}>
                            <ArrowLeft className="h-4 w-4" /> Back to DMAs
                        </Button>
                        <Button variant="outline" size="sm" render={<Link href="/map" />}>
                            View on map
                        </Button>
                    </div>

                    {openBoundaryCount > 0 && (
                        <Card className="border-destructive/50 bg-destructive/5">
                            <CardContent className="flex items-center gap-2 py-3 text-sm text-destructive">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                {openBoundaryCount} boundary valve{openBoundaryCount === 1 ? " is" : "s are"} open — this DMA
                                isn't actually isolated from the rest of the network right now.
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader className="flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-lg font-semibold text-foreground">{dma.name}</CardTitle>
                                <CardDescription>{tier?.name ?? "Unknown tier"}</CardDescription>
                            </div>
                            <span className="h-4 w-4 rounded-sm" style={{ background: dma.color }} />
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                            <div>
                                <p className="text-xs text-muted-foreground">Inlet meter</p>
                                {inletMeter ? (
                                    <Link href={`/assets/${inletMeter.id}`} className="font-data text-foreground hover:text-primary hover:underline">
                                        {inletMeter.name}
                                    </Link>
                                ) : (
                                    <p className="font-data text-muted-foreground">Unknown</p>
                                )}
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Boundary valves</p>
                                <p className="font-data">{boundaryValves.length}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Traced members</p>
                                <p className="font-data">{members.length}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base font-semibold text-foreground">Boundary valves</CardTitle>
                            <CardDescription>Should all be closed to seal this DMA off from the rest of the network.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <BasicTable columns={boundaryValveColumns} rows={boundaryValves} getRowKey={(n) => n.id} emptyMessage="No boundary valves assigned yet." />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base font-semibold text-foreground">Non-revenue water</CardTitle>
                            <CardDescription>Requires the billing module — not available yet.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                NRW is calculated by comparing this DMA's metered inflow against aggregated customer
                                billing within its boundary. Once customer accounts exist, this card becomes the actual
                                water-balance result.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base font-semibold text-foreground">Traced members</CardTitle>
                            <CardDescription>Assets reachable from the inlet meter without crossing a closed valve.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <BasicTable columns={memberColumns} rows={members} getRowKey={(n) => n.id} emptyMessage="No members traced." />
                        </CardContent>
                    </Card>
                </div>
            </main>
        </>
    );
}