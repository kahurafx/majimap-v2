import type { NetworkNode, NodeType } from "@majimap/shared-types";
import type { Attachment } from "./attachments";

/** The node plus the two things this round adds. Folds into NetworkNode once the schema has them. */
export type AppNode = NetworkNode & { junction?: JunctionSpec | null; attachments?: Attachment[] };

/* ---------- Photos ---------- */

export type PhotoRule = "required" | "optional";

/**
 * Required where the asset is above ground and worth proving (a disputed meter,
 * a pump station). Optional where it's buried, chambered or routine.
 * Change a rule here and the form follows.
 */
export const NODE_PHOTO_RULE: Record<NodeType, PhotoRule> = {
    reservoir: "required",
    pumping_station: "required",
    meter: "required",
    valve: "optional",
    hydrant: "optional",
    junction: "optional",
};
export const STRUCTURE_PHOTO_RULE: PhotoRule = "optional";
export const MAX_PHOTOS = 5;

/* ---------- Junctions ---------- */

export type JunctionType = "tee" | "cross" | "elbow" | "wye" | "reducer";

/** `branchSizeMm === null` means equal: the same size all the way through. */
export type JunctionSpec = { type: JunctionType; mainSizeMm: number; branchSizeMm: number | null };

export const JUNCTION_TYPES: JunctionType[] = ["tee", "cross", "elbow", "wye", "reducer"];

export const JUNCTION_TYPE_LABEL: Record<JunctionType, string> = {
    tee: "Tee",
    cross: "Cross",
    elbow: "Elbow",
    wye: "Wye",
    reducer: "Reducer",
};

export const JUNCTION_TYPE_HINT: Record<JunctionType, string> = {
    tee: "Three ways: one branch off the main",
    cross: "Four ways: two pipes crossing",
    elbow: "A bend in the line",
    wye: "A branch leaving at an angle",
    reducer: "Steps the pipe down in size",
};

/** Common nominal sizes for quick picking. Anything else can be typed. */
export const PIPE_SIZES_MM = [50, 63, 75, 100, 150, 200, 250, 300, 400, 500];

export const outletLabel = (t: JunctionType) => (t === "elbow" || t === "reducer" ? "Outlet size (mm)" : "Branch size (mm)");

export function describeJunction(j: JunctionSpec): string {
    const sizes = j.branchSizeMm ? `${j.mainSizeMm} × ${j.branchSizeMm} mm` : `${j.mainSizeMm} mm`;
    return `${JUNCTION_TYPE_LABEL[j.type]} ${sizes} · ${j.branchSizeMm ? "reduced" : "equal"}`;
}

/** Mock specs for the two existing junctions. */
export const mockJunctionSpecs: Record<string, JunctionSpec> = {
    "n-junc-1": { type: "tee", mainSizeMm: 250, branchSizeMm: 200 },
    "n-junc-2": { type: "elbow", mainSizeMm: 200, branchSizeMm: null },
};