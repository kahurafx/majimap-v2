import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BasicTable, type BasicTableColumn } from "@/components/tables/basic-table";
import { Badge } from "@/components/ui/badge";
import { mockUsers } from "@/lib/mock-data";
import { timeSince } from "@/lib/utils";
import type { User } from "@majimap/shared-types";

function syncStatus(lastSyncedAt: string | null): { label: string; variant: "good" | "fair" | "critical" } {
  if (!lastSyncedAt) return { label: "Never synced", variant: "critical" };
  const hours = (Date.now() - new Date(lastSyncedAt).getTime()) / 3600000;
  if (hours >= 168) return { label: "New captures blocked", variant: "critical" };
  if (hours >= 72) return { label: "Sync overdue", variant: "fair" };
  return { label: "Up to date", variant: "good" };
}

const columns: BasicTableColumn<User>[] = [
  { key: "name", header: "Technician", render: (u) => <span className="font-medium">{u.name}</span> },
  { key: "last", header: "Last synced", render: (u) => <span className="font-data text-muted-foreground">{timeSince(u.lastSyncedAt)}</span> },
  {
    key: "status",
    header: "Status",
    render: (u) => {
      const s = syncStatus(u.lastSyncedAt);
      return <Badge variant={s.variant}>{s.label}</Badge>;
    },
  },
];

export function TechnicianActivity() {
  const technicians = mockUsers.filter((u) => u.role === "field_technician" && u.isActive);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground text-base font-semibold">Field technician activity</CardTitle>
        <CardDescription>
          Reminder at 24h since last sync, warning at 72h, new captures blocked at 7 days (viewing is never blocked).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <BasicTable columns={columns} rows={technicians} getRowKey={(u) => u.id} />
      </CardContent>
    </Card>
  );
}
