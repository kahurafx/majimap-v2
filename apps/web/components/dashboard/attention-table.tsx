"use client";

import Link from "next/link";
import {Card, CardContent, CardHeader, CardTitle, CardDescription} from "@/components/ui/card";
import {DataTableShell} from "@/components/tables/data-table-shell";
import {DataTableColumnHeader} from "@/components/tables/data-table-column-header";
import {ConditionBadge} from "@/components/condition-badge";
import {columnHelperFor} from "@/lib/table/features";
import {useAppTable} from "@/lib/table/use-app-table";
import {mockNodes, mockPipes} from "@/lib/mock-data";
import {formatDateTime} from "@/lib/utils";
import type {Condition} from "@majimap/shared-types";

interface AttentionRow {
    id: string;
    label: string;
    kind: string;
    condition: Condition;
    lastChecked: string | null;
}

const rows: AttentionRow[] = [
    ...mockNodes
        .filter((n) => n.condition === "poor" || n.condition === "critical")
        .map((n) => ({
            id: n.id,
            label: n.name,
            kind: n.type.replace("_", " "),
            condition: n.condition,
            lastChecked: n.lastInspectedAt
        })),
    ...mockPipes
        .filter((p) => p.condition === "poor" || p.condition === "critical")
        .map((p) => ({id: p.id, label: `Pipe ${p.id}`, kind: "pipe", condition: p.condition, lastChecked: null})),
].sort((a, b) => (a.condition === b.condition ? 0 : a.condition === "critical" ? -1 : 1));

const columnHelper = columnHelperFor<AttentionRow>();

const columns = columnHelper.columns([
    columnHelper.accessor("label", {
        header: ({column}) => <DataTableColumnHeader column={column} title="Asset"/>,
        cell: ({row}) => (
            <Link href={`/assets/${row.original.id}`}
                  className="font-medium text-foreground hover:text-primary hover:underline">
                {row.original.label}
            </Link>
        ),
    }),
    columnHelper.accessor("kind", {
        header: ({column}) => <DataTableColumnHeader column={column} title="Type"/>,
        cell: ({getValue}) => <span className="capitalize text-muted-foreground">{getValue()}</span>,
    }),
    columnHelper.accessor("condition", {
        header: ({column}) => <DataTableColumnHeader column={column} title="Condition"/>,
        cell: ({getValue}) => <ConditionBadge condition={getValue()}/>,
    }),
    columnHelper.accessor("lastChecked", {
        header: ({column}) => <DataTableColumnHeader column={column} title="Last inspected"/>,
        cell: ({getValue}) => <span
            className="font-data text-xs text-muted-foreground">{formatDateTime(getValue())}</span>,
    }),
]);

export function AttentionTable() {
    const table = useAppTable({key: "attention-table", columns, data: rows});

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-foreground text-base font-semibold">Assets needing attention</CardTitle>
                <CardDescription>Anything currently logged as poor or critical condition.</CardDescription>
            </CardHeader>
            <CardContent>
                <DataTableShell table={table} filterPlaceholder="Search assets..."/>
            </CardContent>
        </Card>
    );
}