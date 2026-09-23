import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// import { ConditionBadge } from "@/components/condition-badge";
import { BasicTable, type BasicTableColumn } from "@/components/tables/basic-table";
import { mockNodes, mockPipes, mockConditionLogs, mockValveStateLogs, mockUsers } from "@/lib/mock-data";
import { formatDateTime } from "@/lib/utils";
import type { ConditionLog, ValveStateLog } from "@majimap/shared-types";
import {ConditionBadge} from "@/components/condition-badge";

function userName(id: string) {
  return mockUsers.find((u) => u.id === id)?.name ?? "Unknown";
}

const conditionLogColumns: BasicTableColumn<ConditionLog>[] = [
  { key: "condition", header: "Condition", render: (l) => <ConditionBadge condition={l.condition} /> },
  { key: "note", header: "Note", render: (l) => <span className="text-foreground">{l.note ?? "—"}</span> },
  { key: "by", header: "Recorded by", render: (l) => <span className="text-muted-foreground">{userName(l.recordedByUserId)}</span> },
  { key: "at", header: "Recorded at", render: (l) => <span className="font-data text-xs text-muted-foreground">{formatDateTime(l.recordedAt)}</span> },
  { key: "synced", header: "Synced", render: (l) => (l.syncedAt ? <span className="text-success text-xs">Yes</span> : <span className="text-warning text-xs">Pending</span>) },
];

const valveLogColumns: BasicTableColumn<ValveStateLog>[] = [
  { key: "state", header: "State", render: (l) => (l.isOpen ? <span className="text-success font-medium">Open</span> : <span className="text-destructive font-medium">Closed</span>) },
  { key: "by", header: "Changed by", render: (l) => <span className="text-muted-foreground">{userName(l.changedByUserId)}</span> },
  { key: "at", header: "Changed at", render: (l) => <span className="font-data text-xs text-muted-foreground">{formatDateTime(l.changedAt)}</span> },
  { key: "synced", header: "Synced", render: (l) => (l.syncedAt ? <span className="text-success text-xs">Yes</span> : <span className="text-warning text-xs">Pending</span>) },
];

export default function AssetDetailPage({ params }: { params: { id: string } }) {
  const node = mockNodes.find((n) => n.id === params.id);
  const pipe = mockPipes.find((p) => p.id === params.id);

  if (!node && !pipe) notFound();

  const title = node ? node.name : `Pipe ${pipe!.id}`;
  const conditionLogs = mockConditionLogs
    .filter((l) => (node ? l.nodeId === node.id : l.pipeId === pipe!.id))
    .sort((a, b) => +new Date(b.recordedAt) - +new Date(a.recordedAt));
  const valveLogs = node
    ? mockValveStateLogs.filter((l) => l.nodeId === node.id).sort((a, b) => +new Date(b.changedAt) - +new Date(a.changedAt))
    : [];

  return (
    <>
      <Topbar title={title} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <Button variant="ghost" size="sm" className="w-fit">
            <Link href="/assets">
              <ArrowLeft className="h-4 w-4" /> Back to assets
            </Link>
          </Button>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">{title}</CardTitle>
                <CardDescription>
                  {node ? (
                    <span className="capitalize">{node.type.replace("_", " ")}</span>
                  ) : (
                    <>
                      {pipe!.material.replace("_", " ")} · {pipe!.diameterMm} mm · {pipe!.lengthM} m
                    </>
                  )}
                </CardDescription>
              </div>
              <ConditionBadge condition={node ? node.condition : pipe!.condition} />
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Asset ID</p>
                <p className="font-data">{params.id}</p>
              </div>
              {node && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="font-data">
                      {node.location.lat.toFixed(5)}, {node.location.lng.toFixed(5)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Installed</p>
                    <p className="font-data">{formatDateTime(node.installedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last inspected</p>
                    <p className="font-data">{formatDateTime(node.lastInspectedAt)}</p>
                  </div>
                </>
              )}
              {pipe && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">From</p>
                    <p className="font-data">{pipe.fromNodeId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">To</p>
                    <p className="font-data">{pipe.toNodeId}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {node?.type === "valve" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold text-foreground">Valve state history</CardTitle>
                <CardDescription>
                  Kept in sync with the current state by timestamp, not insertion order — offline syncs can arrive
                  out of order.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BasicTable columns={valveLogColumns} rows={valveLogs} getRowKey={(l) => l.id} emptyMessage="No state changes logged yet." />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">Condition history</CardTitle>
              <CardDescription>Field-logged inspections for this asset.</CardDescription>
            </CardHeader>
            <CardContent>
              <BasicTable columns={conditionLogColumns} rows={conditionLogs} getRowKey={(l) => l.id} emptyMessage="No condition logs yet." />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
