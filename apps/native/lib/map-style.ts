import { CONDITION_HEX, type NodeType } from "@majimap/shared-types";
import { NODE_TYPES } from "./assets";

/**
 * Mirrors network-map.tsx on the web so the two maps look alike.
 * TODO: move these constants (and CONDITION_HEX) into one shared package so
 * the web and native maps can't drift apart.
 */
export const LIGHT_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
export const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export const NODE_RADIUS: Record<NodeType, number> = { reservoir: 9, pumping_station: 8, valve: 6, junction: 4, meter: 6, hydrant: 6 };
export const SUBNETWORK_PALETTE = ["#3B82F6", "#A855F7", "#F59E0B", "#EC4899", "#10B981", "#64748B"];
export const SUBNETWORK_FALLBACK = "#94a3b8";
export const WARNING_RED = "#ef4444";
export const NODE_STROKE = "#ffffff";

type Expr = unknown[];

export const conditionColorExpr: Expr = [
    "match", ["get", "condition"],
    "good", CONDITION_HEX.good,
    "fair", CONDITION_HEX.fair,
    "poor", CONDITION_HEX.poor,
    "critical", CONDITION_HEX.critical,
    CONDITION_HEX.unknown,
];

export function subnetworkColorExpr(colorById: Record<string, string>): Expr | string {
    const entries = Object.entries(colorById);
    return entries.length ? ["match", ["get", "id"], ...entries.flatMap(([id, color]) => [id, color]), SUBNETWORK_FALLBACK] : SUBNETWORK_FALLBACK;
}

/** The web sizes were set for a mouse. On a phone they grow with zoom so they stay tappable and legible. */
const zoomScaled = (value: unknown): Expr => ["interpolate", ["linear"], ["zoom"], 12, ["*", 0.6, value], 18, ["*", 1.7, value]];

export const nodeRadiusExpr: Expr = zoomScaled(["match", ["get", "type"], ...NODE_TYPES.flatMap((t) => [t, NODE_RADIUS[t]]), 5]);
export const pipeWidthExpr: Expr = zoomScaled(["interpolate", ["linear"], ["get", "diameterMm"], 100, 2, 400, 5]);
export const haloRadiusExpr: Expr = zoomScaled(15);
export const valveDotRadiusExpr: Expr = zoomScaled(2.4);