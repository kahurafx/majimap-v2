import type {Column, RowData} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppTableFeatures } from "@/lib/table/features";

interface DataTableColumnHeaderProps<TData extends RowData> extends React.HTMLAttributes<HTMLDivElement> {
    column: Column<AppTableFeatures, TData>;
    title: string;
}

export function DataTableColumnHeader<TData extends RowData>({ column, title, className }: DataTableColumnHeaderProps<TData>) {
    if (!column.getCanSort()) {
        return <div className={cn("text-xs font-medium text-muted-foreground", className)}>{title}</div>;
    }

    const sorted = column.getIsSorted();

    return (
        <Button
            variant="ghost"
            size="sm"
            className={cn("-ml-3 h-8 text-xs font-medium text-muted-foreground hover:text-foreground", className)}
            onClick={() => column.toggleSorting(sorted === "asc")}
        >
            {title}
            {sorted === "asc" && <ArrowUp className="h-3.5 w-3.5" />}
            {sorted === "desc" && <ArrowDown className="h-3.5 w-3.5" />}
            {!sorted && <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />}
        </Button>
    );
}