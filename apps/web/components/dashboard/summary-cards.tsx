import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockNodes, mockPipes, mockUsers } from "@/lib/mock-data";

function sum<T>(arr: T[], fn: (t: T) => number) {
  return arr.reduce((acc, t) => acc + fn(t), 0);
}

export function SummaryCards() {
  const totalLengthKm = sum(mockPipes, (p) => p.lengthM) / 1000;
  const closedValves = mockNodes.filter((n) => n.type === "valve" && n.isOpen === false).length;
  const attentionCount = mockNodes.filter((n) => n.condition === "poor" || n.condition === "critical").length
    + mockPipes.filter((p) => p.condition === "poor" || p.condition === "critical").length;
  const activeTechs = mockUsers.filter((u) => u.role === "field_technician" && u.isActive).length;

  const stats = [
    { label: "Assets tracked", value: `${mockNodes.length + mockPipes.length}` },
    { label: "Pipe network length", value: `${totalLengthKm.toFixed(1)} km` },
    { label: "Valves currently closed", value: `${closedValves}` },
    { label: "Assets needing attention", value: `${attentionCount}` },
    { label: "Active field technicians", value: `${activeTechs}` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardHeader className="pb-0">
            <CardTitle>{s.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-data text-2xl font-semibold text-foreground">{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
