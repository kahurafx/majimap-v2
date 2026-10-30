import { Waves, Cog, CircleDot, Network, Gauge, Droplets, type LucideIcon } from "lucide-react-native";
import type { NodeType, StructureType } from "@majimap/shared-types";

export const NODE_TYPES: NodeType[] = ["reservoir", "pumping_station", "valve", "junction", "meter", "hydrant"];
export const STRUCTURE_TYPES: StructureType[] = ["vault", "chamber", "manhole", "kiosk", "trench"];

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
    reservoir: "Reservoir",
    pumping_station: "Pumping station",
    valve: "Valve",
    junction: "Junction",
    meter: "Meter",
    hydrant: "Hydrant",
};

export const NODE_TYPE_PLURAL: Record<NodeType, string> = {
    reservoir: "Reservoirs",
    pumping_station: "Pumps",
    valve: "Valves",
    junction: "Junctions",
    meter: "Meters",
    hydrant: "Hydrants",
};

export const NODE_TYPE_ICON: Record<NodeType, LucideIcon> = {
    reservoir: Waves,
    pumping_station: Cog,
    valve: CircleDot,
    junction: Network,
    meter: Gauge,
    hydrant: Droplets,
};

export const NODE_TYPE_COLOR: Record<NodeType, string> = {
    reservoir: "#38BDF8",
    pumping_station: "#A78BFA",
    valve: "#FB923C",
    junction: "#FACC15",
    meter: "#67E8F9",
    hydrant: "#FB7185",
};

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const titleCase = (s: string) => cap(s.replace(/_/g, " "));

/** Inspections older than this are flagged as overdue. Move to org settings later. */
export const INSPECTION_INTERVAL_DAYS = 180;

export function timeAgo(iso: string | null | undefined): string {
    if (!iso) return "Never";
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} d ago`;
    if (days < 365) return `${Math.round(days / 30)} mo ago`;
    return `${Math.floor(days / 365)} y ago`;
}

export type InspectionState = "never" | "overdue" | "ok";
export function inspectionState(iso: string | null | undefined): InspectionState {
    if (!iso) return "never";
    const days = (Date.now() - new Date(iso).getTime()) / 86400000;
    return days > INSPECTION_INTERVAL_DAYS ? "overdue" : "ok";
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return "Not recorded";
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const formatCoords = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

export function approxMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const dLat = (b.lat - a.lat) * 111_320;
    const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
}
