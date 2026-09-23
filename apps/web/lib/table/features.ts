import {
    createColumnHelper,
    createFilteredRowModel,
    createPaginatedRowModel,
    createSortedRowModel,
    stockFeatures,
    tableFeatures,
} from "@tanstack/react-table";
import type { RowData } from "@tanstack/react-table";

/**
 * One shared feature set for every table in the app. Under the new API a
 * table's columns are typed against its features (not just its row shape),
 * so reuse across tables now happens by sharing this config — plus the
 * DataTableShell below for rendering — rather than a generic ColumnDef[]
 * prop like the old v8-style DataTable took.
 */
export const tableFeatureSet = tableFeatures({
    ...stockFeatures,
    filteredRowModel: createFilteredRowModel(),
    sortedRowModel: createSortedRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
});

export type AppTableFeatures = typeof tableFeatureSet;

/** Build a column helper for a given row type, bound to the shared features. */
export function columnHelperFor<TData extends RowData>() {
    return createColumnHelper<AppTableFeatures, TData>();
}