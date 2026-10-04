"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/severity-badge";
import { computeAlerts } from "@/lib/alerts";
import { timeSince } from "@/lib/utils";

const alerts = computeAlerts();

export default function AlertsPage() {
    const [filter, setFilter] = useState<"all" | "critical" | "warning">("all");
    const visible = filter === "all" ? alerts : alerts.filter((a) => a.severity === filter);

    return (
        <>
            <Topbar title="Alerts" />
            <main className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex max-w-3xl flex-col gap-4">
                    <div className="flex items-center gap-2">
                        {(["all", "critical", "warning"] as const).map((f) => (
                            <Button
                                key={f}
                                size="sm"
                                variant={filter === f ? "secondary" : "outline"}
                                className="capitalize"
                                onClick={() => setFilter(f)}
                            >
                                {f}
                            </Button>
                        ))}
                    </div>

                    {visible.length === 0 && (
                        <Card>
                            <CardContent className="py-8 text-center text-sm text-muted-foreground">No alerts.</CardContent>
                        </Card>
                    )}

                    {visible.map((alert) => (
                        <Card key={alert.id}>
                            <CardContent className="flex items-start gap-3 py-4">
                                {alert.severity === "critical" ? (
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                                ) : (
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                )}
                                <div className="flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <Link href={alert.href} className="text-sm font-medium text-foreground hover:text-primary hover:underline">
                                            {alert.title}
                                        </Link>
                                        <SeverityBadge tone={alert.severity === "critical" ? "critical" : "fair"}>
                                            {alert.severity === "critical" ? "Critical" : "Warning"}
                                        </SeverityBadge>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">{alert.description}</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">{timeSince(alert.occurredAt)}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </main>
        </>
    );
}