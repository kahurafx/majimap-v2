import {
    createColumnHelper,
    createFilteredRowModel,
    createPaginatedRowModel,
    createSortedRowModel,
    filterFn_includesString,
    sortFn_alphanumeric,
    sortFn_alphanumericCaseSensitive,
    sortFn_basic,
    sortFn_datetime,
    sortFn_text,
    sortFn_textCaseSensitive,
    stockFeatures,
    tableFeatures,
} from "@tanstack/react-table";
import type { RowData } from "@tanstack/react-table";

/**
 * One shared feature set for every table in the app. Under the new API a
 * table's columns are typed against its features (not just its row shape),
 * so reuse across tables now happens by sharing this config — plus the
 * DataTableShell for rendering — rather than a generic ColumnDef[] prop
 * like the old v8-style DataTable took.
 *
 * `filterFns` / `sortFns` are registries: the string names accepted by
 * `globalFilterFn` / `sortFn` (and used by "auto" sort detection) are the
 * keys registered here, so anything the app relies on must be listed.
 */
export const tableFeatureSet = tableFeatures({
    ...stockFeatures,
    filteredRowModel: createFilteredRowModel(),
    sortedRowModel: createSortedRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
    filterFns: { includesString: filterFn_includesString },
    sortFns: {
        alphanumeric: sortFn_alphanumeric,
        alphanumericCaseSensitive: sortFn_alphanumericCaseSensitive,
        basic: sortFn_basic,
        datetime: sortFn_datetime,
        text: sortFn_text,
        textCaseSensitive: sortFn_textCaseSensitive,
    },
});

export type AppTableFeatures = typeof tableFeatureSet;

/** Build a column helper for a given row type, bound to the shared features. */
export function columnHelperFor<TData extends RowData>() {
    return createColumnHelper<AppTableFeatures, TData>();
}