"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { RefreshCw, Pencil, Plus, Users2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { BasicTable, type BasicTableColumn } from "@/components/tables/basic-table";
import { ConditionBadge } from "@/components/condition-badge";
import { mockTiers, mockSubnetworks, mockNodes, mockPipes } from "@/lib/mock-data";
import { traceSubnetworkMembership } from "@/lib/network-graph";
import { formatDateTime } from "@/lib/utils";
import type { Subnetwork, NetworkNode } from "@majimap/shared-types";

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

const CONTROLLER_CANDIDATE_TYPES: NetworkNode["type"][] = ["reservoir", "pumping_station", "valve"];

function initialMembershipCache(): Record<string, NetworkNode[]> {
    const cache: Record<string, NetworkNode[]> = {};
    for (const sn of mockSubnetworks) {
        if (sn.lastValidatedAt) {
            cache[sn.id] = traceSubnetworkMembership(sn.controllerNodeId, mockNodes, mockPipes);
        }
    }
    return cache;
}

export default function TiersPage() {
    const [subnetworks, setSubnetworks] = useState<Subnetwork[]>(mockSubnetworks);
    const [membershipCache, setMembershipCache] = useState<Record<string, NetworkNode[]>>(initialMembershipCache);
    const [viewingMembersOf, setViewingMembersOf] = useState<Subnetwork | null>(null);
    const [editing, setEditing] = useState<Subnetwork | "new" | null>(null);
    const [formName, setFormName] = useState("");
    const [formTierId, setFormTierId] = useState(mockTiers[0].id);
    const [formControllerId, setFormControllerId] = useState(mockNodes[0].id);

    const controllerCandidates = mockNodes.filter((n) => CONTROLLER_CANDIDATE_TYPES.includes(n.type));

    function openNew() {
        setFormName("");
        setFormTierId(mockTiers[0].id);
        setFormControllerId(controllerCandidates[0]?.id ?? mockNodes[0].id);
        setEditing("new");
    }

    function openEdit(sn: Subnetwork) {
        setFormName(sn.name);
        setFormTierId(sn.tierId);
        setFormControllerId(sn.controllerNodeId);
        setEditing(sn);
    }

    function handleSave() {
        if (editing === "new") {
            const newSubnetwork: Subnetwork = {
                id: `sn-${Date.now()}`,
                name: formName.trim() || "Untitled subnetwork",
                tierId: formTierId,
                controllerNodeId: formControllerId,
                lastValidatedAt: null,
            };
            setSubnetworks((prev) => [...prev, newSubnetwork]);
            toast.success(`${newSubnetwork.name} created`, { description: "Run validation to compute its membership." });
        } else if (editing) {
            const editedId = editing.id;
            setSubnetworks((prev) =>
                prev.map((sn) =>
                    sn.id === editedId
                        ? { ...sn, name: formName.trim() || sn.name, tierId: formTierId, controllerNodeId: formControllerId, lastValidatedAt: null }
                        : sn,
                ),
            );
            setMembershipCache((prev) => {
                const next = { ...prev };
                delete next[editedId];
                return next;
            });
            toast.success("Subnetwork updated", { description: "Controller changed — re-validate to refresh its membership." });
        }
        setEditing(null);
    }

    function handleValidate(sn: Subnetwork) {
        const members = traceSubnetworkMembership(sn.controllerNodeId, mockNodes, mockPipes);
        setMembershipCache((prev) => ({ ...prev, [sn.id]: members }));
        setSubnetworks((prev) => prev.map((s) => (s.id === sn.id ? { ...s, lastValidatedAt: new Date().toISOString() } : s)));
        toast.success(`${sn.name} validated`, { description: `${members.length} member asset${members.length === 1 ? "" : "s"} found.` });
    }

    return (
        <>
            <Topbar title="Tiers & subnetworks" />
            <main className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex max-w-6xl flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Subnetworks are computed by tracing outward from a controller node, stopping at closed valves —
                            not drawn by hand.
                        </p>
                        <Button onClick={openNew}>
                            <Plus className="h-4 w-4" /> New subnetwork
                        </Button>
                    </div>

                    {[...mockTiers]
                        .sort((a, b) => a.order - b.order)
                        .map((tier) => {
                            const tierSubnetworks = subnetworks.filter((sn) => sn.tierId === tier.id);
                            return (
                                <Card key={tier.id}>
                                    <CardHeader>
                                        <CardTitle className="text-base font-semibold text-foreground">
                                            Tier {tier.order} · {tier.name}
                                        </CardTitle>
                                        <CardDescription>
                                            {tierSubnetworks.length} subnetwork{tierSubnetworks.length === 1 ? "" : "s"}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex flex-col gap-3">
                                        {tierSubnetworks.length === 0 && (
                                            <p className="text-sm text-muted-foreground">No subnetworks in this tier yet.</p>
                                        )}
                                        {tierSubnetworks.map((sn) => {
                                            const controller = mockNodes.find((n) => n.id === sn.controllerNodeId);
                                            const members = membershipCache[sn.id];
                                            return (
                                                <div key={sn.id} className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                                                    <div className="flex flex-col gap-1">
                                                        <p className="text-sm font-medium text-foreground">{sn.name}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Controller:{" "}
                                                            {controller ? (
                                                                <Link href={`/assets/${controller.id}`} className="hover:text-primary hover:underline">
                                                                    {controller.name}
                                                                </Link>
                                                            ) : (
                                                                "Unknown"
                                                            )}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Last validated: {sn.lastValidatedAt ? formatDateTime(sn.lastValidatedAt) : "Never"}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {members ? (
                                                            <Button variant="outline" size="sm" onClick={() => setViewingMembersOf(sn)}>
                                                                <Users2 className="h-3.5 w-3.5" /> {members.length}
                                                            </Button>
                                                        ) : (
                                                            <Badge variant="secondary" className="gap-1">
                                                                <RefreshCw className="h-3 w-3" /> Pending validation
                                                            </Badge>
                                                        )}
                                                        <Button variant="outline" size="sm" onClick={() => handleValidate(sn)}>
                                                            <RefreshCw className="h-3.5 w-3.5" /> Validate
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => openEdit(sn)}>
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </CardContent>
                                </Card>
                            );
                        })}
                </div>
            </main>

            <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing === "new" ? "New subnetwork" : "Edit subnetwork"}</DialogTitle>
                        <DialogDescription>
                            Membership is computed automatically from the controller — you&#39;re assigning the starting point,
                            not the members.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="sn-name">Name</Label>
                            <Input id="sn-name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Riverside Distribution Zone" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label>Tier</Label>
                            <Select value={formTierId} onValueChange={setFormTierId}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[...mockTiers]
                                        .sort((a, b) => a.order - b.order)
                                        .map((t) => (
                                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label>Controller node</Label>
                            <Select value={formControllerId} onValueChange={setFormControllerId}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {controllerCandidates.map((n) => (
                                        <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Sources, pumping stations, and valves can act as a controller.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button onClick={handleSave}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={viewingMembersOf !== null} onOpenChange={(open) => !open && setViewingMembersOf(null)}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{viewingMembersOf?.name}</DialogTitle>
                        <DialogDescription>Assets reachable from the controller, without crossing a closed valve.</DialogDescription>
                    </DialogHeader>
                    <BasicTable
                        columns={memberColumns}
                        rows={viewingMembersOf ? membershipCache[viewingMembersOf.id] ?? [] : []}
                        getRowKey={(n) => n.id}
                        emptyMessage="No members found — check the controller is connected to the network."
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}