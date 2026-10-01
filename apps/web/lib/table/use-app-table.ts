"use client";

import { useTable } from "@tanstack/react-table";
import type { RowData } from "@tanstack/react-table";
import { columnHelperFor, tableFeatureSet } from "./features";

type ColumnsFor<TData extends RowData> = ReturnType<ReturnType<typeof columnHelperFor<TData>>["columns"]>;

interface UseAppTableOptions<TData extends RowData> {
    /** Unique per table — shows up in the TanStack devtools panel. */
    key: string;
    columns: ColumnsFor<TData>;
    data: TData[];
    pageSize?: number;
}

/**
 * Every sortable/filterable/paginated table in the app shares this one bit
 * of useTable() wiring — only the columns and data differ per table. Use
 * BasicTable instead for small static lists that don't need any of this.
 *
 * Deliberately no explicit type arguments on useTable(): passing only some
 * of <TFeatures, TData, TSelected> makes TypeScript skip inference for the
 * rest, which silently discards the selector's return type and leaves
 * `table.state` typed as the full state instead of just these three slices.
 */
export function useAppTable<TData extends RowData>({ key, columns, data, pageSize = 10 }: UseAppTableOptions<TData>) {
    return useTable(
        {
            key,
            features: tableFeatureSet,
            columns,
            data,
            globalFilterFn: "includesString",
            initialState: { pagination: { pageIndex: 0, pageSize } },
        },
        (state) => ({
            sorting: state.sorting,
            globalFilter: state.globalFilter,
            pagination: state.pagination,
        }),
    );
}