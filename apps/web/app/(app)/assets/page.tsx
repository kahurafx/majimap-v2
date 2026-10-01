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
import { mockNodes, mockPipes, mockStructures } from "@/lib/mock-data";
import { formatDateTime } from "@/lib/utils";
import type { NetworkNode, Pipe, Structure, NodeType, StructureType } from "@majimap/shared-types";
import { STRUCTURE_ATTACHMENT_RULES } from "@majimap/shared-types";

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
    nodeColumnHelper.accessor("structureId", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Housed in" />,
        cell: ({ getValue }) => {
            const structure = mockStructures.find((s) => s.id === getValue());
            if (!structure) return <span className="text-muted-foreground">—</span>;
            return (
                <Link href={`/assets/${structure.id}`} className="text-muted-foreground hover:text-primary hover:underline">
                    {structure.name}
                </Link>
            );
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

const structureColumnHelper = columnHelperFor<Structure>();

const structureColumns = structureColumnHelper.columns([
    structureColumnHelper.accessor("name", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => (
            <Link href={`/assets/${row.original.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                {row.original.name}
            </Link>
        ),
    }),
    structureColumnHelper.accessor("type", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ getValue }) => <span className="capitalize text-muted-foreground">{getValue()}</span>,
    }),
    structureColumnHelper.accessor("condition", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Condition" />,
        cell: ({ getValue }) => <ConditionBadge condition={getValue()} />,
    }),
    structureColumnHelper.display({
        id: "housed",
        header: "Assets housed",
        cell: ({ row }) => (
            <span className="font-data text-muted-foreground">
                {mockNodes.filter((n) => n.structureId === row.original.id).length}
            </span>
        ),
    }),
    structureColumnHelper.accessor("lastInspectedAt", {
        header: ({ column }) =>
            <DataTableColumnHeader column={column} title="Last inspected" />,
        cell: ({ getValue }) => <span className="font-data text-xs text-muted-foreground">{formatDateTime(getValue())}</span>,
    }),
]);

const NODE_TYPE_OPTIONS: { value: NodeType; label: string }[] = [
    { value: "reservoir", label: "Reservoir" },
    { value: "pumping_station", label: "Pumping station" },
    { value: "valve", label: "Valve" },
    { value: "junction", label: "Junction" },
    { value: "meter", label: "Meter" },
    { value: "hydrant", label: "Hydrant" },
];

const STRUCTURE_TYPE_OPTIONS: { value: StructureType; label: string }[] = [
    { value: "vault", label: "Vault" },
    { value: "chamber", label: "Chamber" },
    { value: "manhole", label: "Manhole" },
    { value: "kiosk", label: "Kiosk" },
    { value: "trench", label: "Trench" },
];

export default function AssetsPage() {
    const [open, setOpen] = useState(false);
    const [assetKind, setAssetKind] = useState<"node" | "structure">("node");
    const [nodeType, setNodeType] = useState<NodeType>("valve");
    const [structureId, setStructureId] = useState<string>("none");

    const nodesTable = useAppTable({ key: "assets-nodes", columns: nodeColumns, data: mockNodes });
    const pipesTable = useAppTable({ key: "assets-pipes", columns: pipeColumns, data: mockPipes });
    const structuresTable = useAppTable({ key: "assets-structures", columns: structureColumns, data: mockStructures });

    const allowedStructureTypes = STRUCTURE_ATTACHMENT_RULES[nodeType];
    const availableStructures = mockStructures.filter((s) => allowedStructureTypes.includes(s.type));

    function handleNodeTypeChange(value: NodeType) {
        setNodeType(value);
        setStructureId("none"); // last selection may no longer be a valid pairing
    }

    return (
        <>
            <Topbar title="Assets" />
            <main className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex max-w-6xl flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            {mockNodes.length} nodes · {mockPipes.length} pipes · {mockStructures.length} structures
                        </p>
                        <Button onClick={() => setOpen(true)}>
                            <Plus className="h-4 w-4" /> Add asset
                        </Button>
                    </div>

                    <Tabs defaultValue="nodes">
                        <TabsList>
                            <TabsTrigger value="nodes">Nodes</TabsTrigger>
                            <TabsTrigger value="pipes">Pipes</TabsTrigger>
                            <TabsTrigger value="structures">Structures</TabsTrigger>
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
                        <TabsContent value="structures">
                            <Card>
                                <CardContent className="pt-4">
                                    <DataTableShell table={structuresTable} filterPlaceholder="Search structures..." />
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
                            Pick the location on the map after saving basic details. Location picking isn&#39;t wired up in this
                            mock-data pass yet.
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs value={assetKind} onValueChange={(v) => setAssetKind(v as "node" | "structure")}>
                        <TabsList className="w-full">
                            <TabsTrigger value="node" className="flex-1">Network node</TabsTrigger>
                            <TabsTrigger value="structure" className="flex-1">Structure</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            setOpen(false);
                        }}
                    >
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="asset-name">Name</Label>
                            <Input id="asset-name" placeholder={assetKind === "node" ? "e.g. Valve KLS-06" : "e.g. Vault V-03"} required />
                        </div>

                        {assetKind === "node" ? (
                            <>
                                <div className="flex flex-col gap-1.5">
                                    <Label>Asset type</Label>
                                    <Select value={nodeType} onValueChange={handleNodeTypeChange}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {NODE_TYPE_OPTIONS.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {allowedStructureTypes.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                        <Label>Housed in structure</Label>
                                        <Select value={structureId} onValueChange={setStructureId}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Not housed</SelectItem>
                                                {availableStructures.map((s) => (
                                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            Only {allowedStructureTypes.join("/")} structures can house a {nodeType.replace("_", " ")}.
                                        </p>
                                    </div>
                                )}

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
                            </>
                        ) : (
                            <div className="flex flex-col gap-1.5">
                                <Label>Structure type</Label>
                                <Select defaultValue="vault">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STRUCTURE_TYPE_OPTIONS.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

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