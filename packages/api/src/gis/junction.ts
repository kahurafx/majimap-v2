import type { JunctionSpec } from "@majimap/shared-types";

export type JunctionColumns = { junctionType: JunctionSpec["type"] | null; mainSizeMm: number | null; branchSizeMm: number | null };

/** The three columns for a junction spec, or all NULL for none. */
export const junctionColumns = (j: JunctionSpec | null | undefined): JunctionColumns => ({
    junctionType: j?.type ?? null,
    mainSizeMm: j?.mainSizeMm ?? null,
    branchSizeMm: j?.branchSizeMm ?? null,
});

/** The spec a row holds, or null when the details haven't been recorded. */
export function junctionFromRow(row: Partial<JunctionColumns>): JunctionSpec | null {
    return row.junctionType && row.mainSizeMm
        ? { type: row.junctionType, mainSizeMm: row.mainSizeMm, branchSizeMm: row.branchSizeMm ?? null }
        : null;
}