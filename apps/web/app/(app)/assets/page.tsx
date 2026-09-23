"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTableShell } from "@/components/tables/data-table-shell";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { ConditionBadge } from "@/components/condition-badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { columnHelperFor } from "@/lib/table/features";
import { useAppTable } from "@/lib/table/use-app-table";
import { mockNodes, mockPipes } from "@/lib/mock-data";
import { formatDateTime } from "@/lib/utils";
import type { NetworkNode, Pipe } from "@majimap/shared-types";

const nodeColumnHelper = columnHelperFor<NetworkNode>();

const nodeColumns = nodeColumnHelper.columns([
    nodeColumnHelper.accessor("name", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => (
            <Link href={`/assets/${row.original.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                {row.original.name}
            </Link>
        ),
    }),
    nodeColumnHelper.accessor("type", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ getValue }) => <span className="capitalize text-muted-foreground">{getValue().replace("_", " ")}</span>,
    }),
    nodeColumnHelper.accessor("condition", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Condition" />,
        cell: ({ getValue }) => <ConditionBadge condition={getValue()} />,
    }),
    nodeColumnHelper.accessor("isOpen", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Valve state" />,
        cell: ({ getValue }) => {
            const isOpen = getValue();
            if (isOpen === null) return <span className="text-muted-foreground">—</span>;
            return <span className={isOpen ? "text-success" : "text-destructive"}>{isOpen ? "Open" : "Closed"}</span>;
        },
    }),
    nodeColumnHelper.accessor("lastInspectedAt", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Last inspected" />,
        cell: ({ getValue }) => <span className="font-data text-xs text-muted-foreground">{formatDateTime(getValue())}</span>,
    }),
]);

const pipeColumnHelper = columnHelperFor<Pipe>();

const pipeColumns = pipeColumnHelper.columns([
    pipeColumnHelper.accessor("id", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Pipe" />,
        cell: ({ row }) => (
            <Link href={`/assets/${row.original.id}`} className="font-data font-medium text-foreground hover:text-primary hover:underline">
                {row.original.id}
            </Link>
        ),
    }),
    pipeColumnHelper.accessor("material", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Material" />,
        cell: ({ getValue }) => <span className="capitalize text-muted-foreground">{getValue().replace("_", " ")}</span>,
    }),
    pipeColumnHelper.accessor("diameterMm", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Diameter" />,
        cell: ({ getValue }) => <span className="font-data text-muted-foreground">{getValue()} mm</span>,
    }),
    pipeColumnHelper.accessor("lengthM", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Length" />,
        cell: ({ getValue }) => <span className="font-data text-muted-foreground">{getValue()} m</span>,
    }),
    pipeColumnHelper.accessor("condition", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Condition" />,
        cell: ({ getValue }) => <ConditionBadge condition={getValue()} />,
    }),
]);

export default function AssetsPage() {
    const [open, setOpen] = useState(false);
    const nodesTable = useAppTable({ key: "assets-nodes", columns: nodeColumns, data: mockNodes });
    const pipesTable = useAppTable({ key: "assets-pipes", columns: pipeColumns, data: mockPipes });

    return (
        <>
            <Topbar title="Assets" />
            <main className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex max-w-6xl flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            {mockNodes.length} nodes · {mockPipes.length} pipes
                        </p>
                        <Button onClick={() => setOpen(true)}>
                            <Plus className="h-4 w-4" /> Add asset
                        </Button>
                    </div>

                    <Tabs defaultValue="nodes">
                        <TabsList>
                            <TabsTrigger value="nodes">Nodes</TabsTrigger>
                            <TabsTrigger value="pipes">Pipes</TabsTrigger>
                        </TabsList>
                        <TabsContent value="nodes">
                            <Card>
                                <CardContent className="pt-4">
                                    <DataTableShell table={nodesTable} filterPlaceholder="Search nodes..." />
                                </CardContent>
                            </Card>
                        </TabsContent>
                        <TabsContent value="pipes">
                            <Card>
                                <CardContent className="pt-4">
                                    <DataTableShell table={pipesTable} filterPlaceholder="Search pipes..." />
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </main>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add asset</DialogTitle>
                        <DialogDescription>
                            Pick the location on the map after saving basic details. Location picking isn't wired up in this
                            mock-data pass yet.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            setOpen(false);
                        }}
                    >
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="asset-name">Name</Label>
                            <Input id="asset-name" placeholder="e.g. Valve KLS-06" required />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label>Asset type</Label>
                            <Select defaultValue="valve">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="reservoir">Reservoir</SelectItem>
                                    <SelectItem value="pumping_station">Pumping station</SelectItem>
                                    <SelectItem value="valve">Valve</SelectItem>
                                    <SelectItem value="junction">Junction</SelectItem>
                                    <SelectItem value="meter">Meter</SelectItem>
                                    <SelectItem value="hydrant">Hydrant</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label>Initial condition</Label>
                            <Select defaultValue="good">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="good">Good</SelectItem>
                                    <SelectItem value="fair">Fair</SelectItem>
                                    <SelectItem value="poor">Poor</SelectItem>
                                    <SelectItem value="critical">Critical</SelectItem>
                                    <SelectItem value="unknown">Unknown</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit">Continue to map placement</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}