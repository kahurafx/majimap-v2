"use client";

import type {RowData} from "@tanstack/react-table";
import {Table, TableHeader, TableBody, TableRow, TableHead, TableCell} from "@/components/ui/table";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import type {useAppTable} from "@/lib/table/use-app-table";

interface DataTableShellProps<TData extends RowData> {
    table: ReturnType<typeof useAppTable<TData>>;
    onRowClick?: (row: TData) => void;
    filterPlaceholder?: string;
    emptyMessage?: string;
}

export function DataTableShell<TData extends RowData>(
    {
        table,
        onRowClick,
        filterPlaceholder = "Filter...",
        emptyMessage = "No results.",
    }: DataTableShellProps<TData>) {
    const rows = table.getRowModel().rows;
    const columnCount = table.getAllLeafColumns().length;

    return (
        <div className="flex flex-col gap-3">
            <Input
                placeholder={filterPlaceholder}
                value={(table.state.globalFilter as string) ?? ""}
                onChange={(e) => table.setGlobalFilter(e.target.value)}
                className="max-w-sm"
            />
            <div className="rounded-md border border-border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id}>
                                        {header.isPlaceholder ? null : <table.FlexRender header={header}/>}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {rows.length ? (
                            rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    onClick={() => onRowClick?.(row.original)}
                                    className={onRowClick ? "cursor-pointer" : undefined}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            <table.FlexRender cell={cell}/>
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                                    {emptyMessage}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{table.getFilteredRowModel().rows.length} row(s)</p>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}>
                        Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
            Page {table.state.pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </span>
                    <Button variant="outline" size="sm" onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}>
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}