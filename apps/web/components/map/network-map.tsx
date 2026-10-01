"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createRoot } from "react-dom/client";
import { useTheme } from "next-themes";
import { booleanPointInPolygon, point as turfPoint, polygon as turfPolygon } from "@turf/turf";
import { GeoJSON } from "geojson";
import { toast } from "sonner";

import { mockNodes, mockPipes, mockDmas, mockTiers, mockSubnetworks, CENTER, DMA_COLORS} from "@/lib/mock-data";
import { traceSubnetworkMembership, traceDirectional, traceIsolation, type IsolationTraceResult } from "@/lib/network-graph";
import { CONDITION_HEX } from "@/components/condition-badge";
import type {NodeType, NetworkNode, Dma} from "@majimap/shared-types";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Layers, MapPinned, Pencil, Check, X, ArrowRight, Route, AlertTriangle } from "lucide-react";

const NODE_SOURCE_ID = "nodes";
const PIPE_SOURCE_ID = "pipes";
const DMA_SOURCE_ID = "dmas";
const DMA_DRAFT_LINE_SOURCE_ID = "dma-draft-line";
const DMA_DRAFT_FILL_SOURCE_ID = "dma-draft-fill";

const LIGHT_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const NODE_TYPE_LABEL: Record<NodeType, string> = {
    reservoir: "Reservoirs",
    pumping_station: "Pumping stations",
    valve: "Valves",
    junction: "Junctions",
    meter: "Meters",
    hydrant: "Hydrants",
};
const NODE_TYPES = Object.keys(NODE_TYPE_LABEL) as NodeType[];

const NODE_RADIUS: Record<NodeType, number> = {
    reservoir: 9,
    pumping_station: 8,
    valve: 6,
    junction: 4,
    meter: 6,
    hydrant: 6,
};

const CONDITION_COLOR_EXPR = [
    "match",
    ["get", "condition"],
    "good", CONDITION_HEX.good,
    "fair", CONDITION_HEX.fair,
    "poor", CONDITION_HEX.poor,
    "critical", CONDITION_HEX.critical,
    CONDITION_HEX.unknown,
] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>;

const SUBNETWORK_PALETTE = ["#3B82F6", "#A855F7", "#F59E0B", "#EC4899", "#10B981", "#64748B"];

function subnetworkColorExpr(nodes: NetworkNode[]): maplibregl.DataDrivenPropertyValueSpecification<string> {
    const colorMap: Record<string, string> = {};
    mockSubnetworks.forEach((sn, i) => {
        const members = traceSubnetworkMembership(sn.controllerNodeId, nodes, mockPipes);
        for (const m of members) {
            if (!(m.id in colorMap)) colorMap[m.id] = SUBNETWORK_PALETTE[i % SUBNETWORK_PALETTE.length];
        }
    });
    const entries = Object.entries(colorMap);
    return (entries.length
        ? ["match", ["get", "id"], ...entries.flatMap(([id, color]) => [id, color]), "#94a3b8"]
        : "#94a3b8") as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>;
}

type DraftPoint = { lat: number; lng: number };
type PendingDma = { name: string; inletMeterId: string; boundaryValveIds: string[] };
type MembershipStats = { traced: number; outsideBoundary: number };
type TraceMode = "upstream" | "downstream" | "isolation";
type TraceResult = { affected: NetworkNode[]; valvesToClose?: NetworkNode[]; deadEnds?: number };

function nodesGeoJSON(nodes: NetworkNode[]) {
    return {
        type: "FeatureCollection" as const,
        features: nodes.map((n) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [n.location.lng, n.location.lat] },
            properties: { id: n.id, name: n.name, type: n.type, condition: n.condition, isOpen: n.isOpen },
        })),
    };
}

function pipesGeoJSON() {
    return {
        type: "FeatureCollection" as const,
        features: mockPipes.map((p) => ({
            type: "Feature" as const,
            geometry: { type: "LineString" as const, coordinates: p.path.map((pt) => [pt.lng, pt.lat]) },
            properties: { id: p.id, material: p.material, diameterMm: p.diameterMm, condition: p.condition, lengthM: p.lengthM },
        })),
    };
}

function dmasGeoJSON(dmas: Dma[]) {
    return {
        type: "FeatureCollection" as const,
        features: dmas.map((d) => ({
            type: "Feature" as const,
            geometry: { type: "Polygon" as const, coordinates: [d.ring.map((p) => [p.lng, p.lat])] },
            properties: { id: d.id, name: d.name, color: d.color },
        })),
    };
}

function draftLineGeoJSON(points: DraftPoint[]) {
    return {
        type: "FeatureCollection" as const,
        features:
            points.length >= 2
                ? [{ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: points.map((p) => [p.lng, p.lat]) }, properties: {} }]
                : [],
    };
}

function draftFillGeoJSON(points: DraftPoint[]) {
    return {
        type: "FeatureCollection" as const,
        features:
            points.length >= 3
                ? [
                    {
                        type: "Feature" as const,
                        geometry: {
                            type: "Polygon" as const,
                            coordinates: [[...points.map((p) => [p.lng, p.lat]), [points[0].lng, points[0].lat]]],
                        },
                        properties: {},
                    },
                ]
                : [],
    };
}

function applyHighlight(map: maplibregl.Map, highlightIds: string[], warningIds: string[]) {
    map.setPaintProperty(
        "nodes-circle",
        "circle-opacity",
        highlightIds.length ? ["case", ["in", ["get", "id"], ["literal", highlightIds]], 1, 0.2] : 1,
    );
    map.setPaintProperty(
        "nodes-circle",
        "circle-stroke-color",
        warningIds.length ? ["case", ["in", ["get", "id"], ["literal", warningIds]], "#ef4444", "#ffffff"] : "#ffffff",
    );
    map.setPaintProperty(
        "nodes-circle",
        "circle-stroke-width",
        warningIds.length ? ["case", ["in", ["get", "id"], ["literal", warningIds]], 3, 1.5] : 1.5,
    );
}

function clearHighlight(map: maplibregl.Map) {
    map.setPaintProperty("nodes-circle", "circle-opacity", 1);
    map.setPaintProperty("nodes-circle", "circle-stroke-color", "#ffffff");
    map.setPaintProperty("nodes-circle", "circle-stroke-width", 1.5);
}

function NodePopupCard({
                           node,
                           onToggleValve,
                           onMarkInspected,
                       }: {
    node: NetworkNode;
    onToggleValve: () => void;
    onMarkInspected: () => void;
}) {
    const isValve = node.type === "valve";
    return (
        <Card className="w-64 gap-0 border p-0 shadow-lg">
            <CardHeader className="gap-1 p-3 pb-2">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-tight">{node.name}</p>
                    <Badge
                        variant="outline"
                        className="shrink-0 text-[10px] capitalize"
                        style={{ borderColor: CONDITION_HEX[node.condition], color: CONDITION_HEX[node.condition] }}
                    >
                        {node.condition}
                    </Badge>
                </div>
                <p className="text-xs capitalize text-muted-foreground">{node.type.replace("_", " ")}</p>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-0">
                {isValve && (
                    <p className="text-xs">
                        Valve state: <span className="font-medium">{node.isOpen ? "Open" : "Closed"}</span>
                    </p>
                )}
                <p className="text-xs text-muted-foreground">
                    Last inspected: {node.lastInspectedAt ? new Date(node.lastInspectedAt).toLocaleDateString() : "Never"}
                </p>
                <Separator />
                <div className="flex gap-2 pt-1">
                    {isValve ? (
                        <Button size="sm" variant={node.isOpen ? "destructive" : "default"} className="h-7 flex-1 text-xs" onClick={onToggleValve}>
                            {node.isOpen ? "Close valve" : "Open valve"}
                        </Button>
                    ) : (
                        <Button size="sm" className="h-7 flex-1 text-xs" onClick={onMarkInspected}>
                            Mark inspected
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

export function NetworkMap() {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const addLayersRef = useRef<((map: maplibregl.Map) => void) | undefined>(undefined);
    const hasLoadedOnceRef = useRef(false);

    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const [ready, setReady] = useState(false);
    const [nodes, setNodes] = useState<NetworkNode[]>(mockNodes);
    const [visibleTypes, setVisibleTypes] = useState<Set<NodeType>>(new Set(NODE_TYPES));
    const [colorMode, setColorMode] = useState<"condition" | "subnetwork">("condition");
    const [dmas, setDmas] = useState<Dma[]>(mockDmas);
    const [selectedDmaId, setSelectedDmaId] = useState<string | null>(null);
    const [membershipStats, setMembershipStats] = useState<MembershipStats | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [draftPoints, setDraftPoints] = useState<DraftPoint[]>([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [pendingDma, setPendingDma] = useState<PendingDma>({ name: "", inletMeterId: "", boundaryValveIds: [] });

    const [traceMode, setTraceMode] = useState<TraceMode | null>(null);
    const [traceFailedPipeId, setTraceFailedPipeId] = useState<string | null>(null);
    const [traceSkipValveIds, setTraceSkipValveIds] = useState<string[]>([]);
    const [traceResult, setTraceResult] = useState<TraceResult | null>(null);

    const nodesRef = useRef(nodes);
    const dmasRef = useRef(dmas);
    const selectedDmaIdRef = useRef(selectedDmaId);
    const isDrawingRef = useRef(isDrawing);
    const draftPointsRef = useRef(draftPoints);
    const visibleTypesRef = useRef(visibleTypes);
    const traceModeRef = useRef(traceMode);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { dmasRef.current = dmas; }, [dmas]);
    useEffect(() => { selectedDmaIdRef.current = selectedDmaId; }, [selectedDmaId]);
    useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);
    useEffect(() => { draftPointsRef.current = draftPoints; }, [draftPoints]);
    useEffect(() => { visibleTypesRef.current = visibleTypes; }, [visibleTypes]);
    useEffect(() => { traceModeRef.current = traceMode; }, [traceMode]);

    const runDirectionalTrace = useCallback((startNodeId: string, direction: "upstream" | "downstream") => {
        const affected = traceDirectional(startNodeId, direction, nodesRef.current, mockPipes);
        setTraceResult({ affected });
    }, []);

    const runIsolationTrace = useCallback((failedPipeId: string, skipValveIds: string[]) => {
        setTraceFailedPipeId(failedPipeId);
        const result: IsolationTraceResult = traceIsolation(failedPipeId, nodesRef.current, mockPipes, skipValveIds);
        setTraceResult({ affected: result.affectedNodes, valvesToClose: result.valvesToClose, deadEnds: result.deadEnds });
    }, []);

    const openNodePopup = useCallback((e: maplibregl.MapLayerMouseEvent) => {
        const map = mapRef.current;
        const f = e.features?.[0];
        if (!map || !f) return;
        const nodeId = (f.properties as Record<string, unknown>).id as string;
        const node = nodesRef.current.find((n) => n.id === nodeId);
        if (!node) return;
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];

        const container = document.createElement("div");
        const root = createRoot(container);
        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "260px", offset: 12 })
            .setLngLat(coords)
            .setDOMContent(container)
            .addTo(map);

        root.render(
            <NodePopupCard
                node={node}
                onToggleValve={() => {
                    const nextOpen = !node.isOpen;
                    setNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, isOpen: nextOpen } : n)));
                    toast.success(`${node.name} ${nextOpen ? "opened" : "closed"}`);
                    popup.remove();
                }}
                onMarkInspected={() => {
                    setNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, lastInspectedAt: new Date().toISOString() } : n)));
                    toast.success(`${node.name} marked as inspected`);
                    popup.remove();
                }}
            />,
        );

        popup.on("close", () => root.unmount());
    }, []);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const initialDark =
            document.documentElement.classList.contains("dark") ||
            (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: initialDark ? DARK_STYLE : LIGHT_STYLE,
            center: [CENTER.lng, CENTER.lat],
            zoom: 15,
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        addLayersRef.current = (m) => {
            m.addSource(DMA_SOURCE_ID, { type: "geojson", data: dmasGeoJSON(dmasRef.current) });
            m.addLayer({
                id: "dmas-fill",
                type: "fill",
                source: DMA_SOURCE_ID,
                paint: {
                    "fill-color": ["get", "color"],
                    "fill-opacity": ["case", ["==", ["get", "id"], selectedDmaIdRef.current ?? "__none__"], 0.22, 0.08],
                },
            });
            m.addLayer({
                id: "dmas-line",
                type: "line",
                source: DMA_SOURCE_ID,
                paint: {
                    "line-color": ["get", "color"],
                    "line-width": ["case", ["==", ["get", "id"], selectedDmaIdRef.current ?? "__none__"], 2.5, 1],
                },
            });

            m.addSource(DMA_DRAFT_FILL_SOURCE_ID, { type: "geojson", data: draftFillGeoJSON(draftPointsRef.current) });
            m.addLayer({
                id: "dma-draft-fill",
                type: "fill",
                source: DMA_DRAFT_FILL_SOURCE_ID,
                paint: { "fill-color": "#0EA5E9", "fill-opacity": 0.15 },
            });
            m.addSource(DMA_DRAFT_LINE_SOURCE_ID, { type: "geojson", data: draftLineGeoJSON(draftPointsRef.current) });
            m.addLayer({
                id: "dma-draft-line",
                type: "line",
                source: DMA_DRAFT_LINE_SOURCE_ID,
                paint: { "line-color": "#0EA5E9", "line-width": 2, "line-dasharray": [2, 1] },
            });

            m.addSource(PIPE_SOURCE_ID, { type: "geojson", data: pipesGeoJSON() });
            m.addLayer({
                id: "pipes-line",
                type: "line",
                source: PIPE_SOURCE_ID,
                paint: {
                    "line-width": ["interpolate", ["linear"], ["get", "diameterMm"], 100, 2, 400, 5],
                    "line-color": CONDITION_COLOR_EXPR,
                },
            });

            m.addSource(NODE_SOURCE_ID, { type: "geojson", data: nodesGeoJSON(nodesRef.current) });
            m.addLayer({
                id: "nodes-circle",
                type: "circle",
                source: NODE_SOURCE_ID,
                paint: {
                    "circle-radius": [
                        "match",
                        ["get", "type"],
                        ...NODE_TYPES.flatMap((t) => [t, NODE_RADIUS[t]]),
                        5,
                    ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>,
                    "circle-color": CONDITION_COLOR_EXPR,
                    "circle-stroke-width": 1.5,
                    "circle-stroke-color": "#ffffff",
                    "circle-opacity": 1,
                },
            });

            const arr = Array.from(visibleTypesRef.current);
            m.setFilter("nodes-circle", arr.length ? ["in", ["get", "type"], ["literal", arr]] : ["==", ["get", "type"], "__none__"]);
        };

        map.on("click", "nodes-circle", (e) => {
            if (isDrawingRef.current) return;
            const mode = traceModeRef.current;
            if (mode === "upstream" || mode === "downstream") {
                const nodeId = e.features?.[0]?.properties?.id as string | undefined;
                if (nodeId) runDirectionalTrace(nodeId, mode);
                return;
            }
            openNodePopup(e);
        });
        map.on("click", "pipes-line", (e) => {
            if (traceModeRef.current !== "isolation") return;
            const pipeId = e.features?.[0]?.properties?.id as string | undefined;
            if (pipeId) runIsolationTrace(pipeId, []);
        });
        map.on("click", "dmas-fill", (e) => {
            if (isDrawingRef.current || traceModeRef.current) return;
            const f = e.features?.[0];
            if (!f) return;
            const id = f.properties?.id as string;
            setSelectedDmaId((prev) => (prev === id ? null : id));
        });
        map.on("click", (e) => {
            if (!isDrawingRef.current) return;
            setDraftPoints((prev) => [...prev, { lat: e.lngLat.lat, lng: e.lngLat.lng }]);
        });
        map.on("mouseenter", "nodes-circle", () => {
            if (!isDrawingRef.current) map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "nodes-circle", () => {
            map.getCanvas().style.cursor = isDrawingRef.current || traceModeRef.current ? "crosshair" : "";
        });
        map.on("mouseenter", "pipes-line", () => {
            if (traceModeRef.current === "isolation") map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "pipes-line", () => {
            map.getCanvas().style.cursor = isDrawingRef.current || traceModeRef.current ? "crosshair" : "";
        });

        map.on("load", () => {
            addLayersRef.current?.(map);
            hasLoadedOnceRef.current = true;
            setReady(true);
        });

        return () => {
            map.remove();
            mapRef.current = null;
            hasLoadedOnceRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !hasLoadedOnceRef.current) return;
        setReady(false);
        map.setStyle(isDark ? DARK_STYLE : LIGHT_STYLE);
        map.once("style.load", () => {
            addLayersRef.current?.(map);
            setReady(true);
        });
    }, [isDark]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const arr = Array.from(visibleTypes);
        map.setFilter("nodes-circle", arr.length ? ["in", ["get", "type"], ["literal", arr]] : ["==", ["get", "type"], "__none__"]);
    }, [visibleTypes, ready]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        map.setPaintProperty("nodes-circle", "circle-color", colorMode === "condition" ? CONDITION_COLOR_EXPR : subnetworkColorExpr(nodes));
    }, [colorMode, nodes, ready]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        (map.getSource(NODE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(nodesGeoJSON(nodes));
    }, [nodes, ready]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        (map.getSource(DMA_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(dmasGeoJSON(dmas));
    }, [dmas, ready]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const sel = selectedDmaId ?? "__none__";
        map.setPaintProperty("dmas-fill", "fill-opacity", ["case", ["==", ["get", "id"], sel], 0.22, 0.08]);
        map.setPaintProperty("dmas-line", "line-width", ["case", ["==", ["get", "id"], sel], 2.5, 1]);
    }, [selectedDmaId, ready]);

    // Whichever of DMA-selection or an active trace is current drives the
    // same opacity/stroke highlight on nodes-circle — the two are mutually
    // exclusive by construction (each clears the other on select), so this
    // stays a single source of truth instead of two paint systems fighting.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;

        map.setPaintProperty(
            "pipes-line",
            "line-color",
            traceFailedPipeId
                ? ["case", ["==", ["get", "id"], traceFailedPipeId], "#ef4444", CONDITION_COLOR_EXPR]
                : CONDITION_COLOR_EXPR,
        );

        if (traceResult) {
            const highlightIds = traceResult.affected.map((n) => n.id);
            const warningIds = traceResult.valvesToClose?.map((n) => n.id) ?? [];
            applyHighlight(map, highlightIds, warningIds);
            if (traceResult.affected.length) {
                const lats = traceResult.affected.map((n) => n.location.lat);
                const lngs = traceResult.affected.map((n) => n.location.lng);
                map.fitBounds(
                    [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
                    { padding: 80, duration: 600 },
                );
            }
            return;
        }

        if (!selectedDmaId) {
            clearHighlight(map);
            setMembershipStats(null);
            return;
        }

        const dma = dmas.find((d) => d.id === selectedDmaId);
        if (!dma) return;
        const traceIds = traceSubnetworkMembership(dma.inletMeterId, nodes, mockPipes).map((n) => n.id);
        const poly = turfPolygon([dma.ring.map((p) => [p.lng, p.lat])]);
        const polygonIds = nodes.filter((n) => booleanPointInPolygon(turfPoint([n.location.lng, n.location.lat]), poly)).map((n) => n.id);
        const openBoundaryValveIds = dma.boundaryValveIds.filter((id) => nodes.find((n) => n.id === id)?.isOpen === true);
        applyHighlight(map, traceIds, openBoundaryValveIds);
        setMembershipStats({ traced: traceIds.length, outsideBoundary: traceIds.filter((id) => !polygonIds.includes(id)).length });

        const lngs = dma.ring.map((p) => p.lng);
        const lats = dma.ring.map((p) => p.lat);
        map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60, duration: 600 });

    }, [selectedDmaId, dmas, nodes, ready, traceResult, traceFailedPipeId]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        (map.getSource(DMA_DRAFT_LINE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(draftLineGeoJSON(draftPoints));
        (map.getSource(DMA_DRAFT_FILL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(draftFillGeoJSON(draftPoints));
    }, [draftPoints, ready]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        map.getCanvas().style.cursor = isDrawing || traceMode ? "crosshair" : "";
    }, [isDrawing, traceMode]);

    function toggleType(type: NodeType) {
        setVisibleTypes((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    }

    const meterCandidates = nodes.filter((n) => n.type === "meter");
    const valveCandidates = nodes.filter((n) => n.type === "valve");

    function startDrawing() {
        setIsDrawing(true);
        setDraftPoints([]);
        setSelectedDmaId(null);
        clearTrace();
    }

    function cancelDrawing() {
        setIsDrawing(false);
        setDraftPoints([]);
    }

    function openDmaDialog() {
        if (draftPoints.length < 3) return;
        setPendingDma({ name: `Zone ${dmas.length + 1}`, inletMeterId: meterCandidates[0]?.id ?? "", boundaryValveIds: [] });
        setDialogOpen(true);
    }

    function toggleBoundaryValve(id: string) {
        setPendingDma((prev) => ({
            ...prev,
            boundaryValveIds: prev.boundaryValveIds.includes(id)
                ? prev.boundaryValveIds.filter((v) => v !== id)
                : [...prev.boundaryValveIds, id],
        }));
    }

    function finishDma() {
        if (draftPoints.length < 3 || !pendingDma.inletMeterId) return;
        const newDma: Dma = {
            id: `dma-${Date.now()}`,
            name: pendingDma.name.trim() || `Zone ${dmas.length + 1}`,
            color: DMA_COLORS[dmas.length % DMA_COLORS.length],
            tierId: mockTiers.find((t) => t.id === "tier-dma")?.id ?? mockTiers[mockTiers.length - 1].id,
            inletMeterId: pendingDma.inletMeterId,
            boundaryValveIds: pendingDma.boundaryValveIds,
            ring: [...draftPoints, draftPoints[0]],
        };
        setDmas((prev) => [...prev, newDma]);
        setIsDrawing(false);
        setDraftPoints([]);
        setDialogOpen(false);
        toast.success(`${newDma.name} created`, { description: "Head to the DMAs page to review its boundary valves." });
    }

    function selectTraceMode(mode: TraceMode) {
        setTraceMode((prev) => (prev === mode ? null : mode));
        setTraceResult(null);
        setTraceFailedPipeId(null);
        setTraceSkipValveIds([]);
        setSelectedDmaId(null);
        cancelDrawing();
    }

    function skipValve(valveId: string) {
        const next = [...traceSkipValveIds, valveId];
        setTraceSkipValveIds(next);
        if (traceFailedPipeId) runIsolationTrace(traceFailedPipeId, next);
    }

    function clearTrace() {
        setTraceMode(null);
        setTraceResult(null);
        setTraceFailedPipeId(null);
        setTraceSkipValveIds([]);
    }

    return (
        <div className="relative h-dvh w-full">
            <div ref={containerRef} className="h-full w-full" />

            <Card className="absolute left-3 top-3 z-10 w-60 gap-0 border-border/60 bg-card/95 py-3 shadow-md backdrop-blur">
                <CardHeader className="px-3 pb-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Layers className="h-3.5 w-3.5" /> Layers
                    </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 px-3 pb-2">
                    <div className="flex gap-1">
                        <Button
                            size="sm"
                            variant={colorMode === "condition" ? "secondary" : "ghost"}
                            className="h-6 flex-1 text-[10px]"
                            onClick={() => setColorMode("condition")}
                        >
                            Condition
                        </Button>
                        <Button
                            size="sm"
                            variant={colorMode === "subnetwork" ? "secondary" : "ghost"}
                            className="h-6 flex-1 text-[10px]"
                            onClick={() => setColorMode("subnetwork")}
                        >
                            Subnetwork
                        </Button>
                    </div>
                    {NODE_TYPES.map((type) => (
                        <label key={type} className="flex items-center gap-2 text-xs">
                            <Checkbox checked={visibleTypes.has(type)} onCheckedChange={() => toggleType(type)} className="h-3.5 w-3.5" />
                            {NODE_TYPE_LABEL[type]}
                        </label>
                    ))}
                </CardContent>

                <Separator className="my-1" />

                <CardHeader className="px-3 pb-2 pt-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <MapPinned className="h-3.5 w-3.5" /> DMAs
                    </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-1 px-3 pb-2">
                    {dmas.map((d) => (
                        <div key={d.id}>
                            <button
                                onClick={() => setSelectedDmaId((prev) => (prev === d.id ? null : d.id))}
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted",
                                    selectedDmaId === d.id && "bg-muted font-medium",
                                )}
                            >
                                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
                                <span className="flex-1 truncate">{d.name}</span>
                            </button>
                            {selectedDmaId === d.id && membershipStats && (
                                <p className="px-1.5 pb-1 text-[11px] text-muted-foreground">
                                    {membershipStats.traced} traced
                                    {membershipStats.outsideBoundary > 0 && (
                                        <span className="text-destructive"> · {membershipStats.outsideBoundary} outside boundary</span>
                                    )}
                                </p>
                            )}
                        </div>
                    ))}

                    {!isDrawing ? (
                        <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={startDrawing}>
                            <Pencil className="mr-1.5 h-3 w-3" /> Draw DMA
                        </Button>
                    ) : (
                        <div className="mt-2 flex flex-col gap-1.5">
                            <p className="text-[11px] text-muted-foreground">Click the map to add points ({draftPoints.length})</p>
                            <div className="flex gap-1.5">
                                <Button size="sm" className="h-7 flex-1 text-xs" disabled={draftPoints.length < 3} onClick={openDmaDialog}>
                                    <Check className="mr-1 h-3 w-3" /> Finish
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={cancelDrawing}>
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    )}

                    <Button variant="ghost" size="sm" className="mt-1 h-7 justify-between text-xs text-muted-foreground" render={<Link href="/dmas" />}>
                        Manage DMAs
                        <ArrowRight className="h-3 w-3" />
                    </Button>
                </CardContent>
            </Card>

            <Card className="absolute right-3 top-20 z-10 w-72 gap-0 border-border/60 bg-card/95 py-3 shadow-md backdrop-blur">
                <CardHeader className="px-3 pb-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Route className="h-3.5 w-3.5" /> Trace
                    </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 px-3 pb-2">
                    <div className="flex gap-1">
                        {(["upstream", "downstream", "isolation"] as const).map((mode) => (
                            <Button
                                key={mode}
                                size="sm"
                                variant={traceMode === mode ? "default" : "outline"}
                                className="h-7 flex-1 px-1 text-[11px] capitalize"
                                onClick={() => selectTraceMode(mode)}
                            >
                                {mode}
                            </Button>
                        ))}
                    </div>

                    {traceMode && !traceResult && (
                        <p className="text-[11px] text-muted-foreground">
                            {traceMode === "isolation" ? "Click a pipe on the map to simulate a break." : "Click a node on the map to start."}
                        </p>
                    )}

                    {traceResult && (
                        <div className="flex flex-col gap-2">
                            <p className="text-xs">
                                <span className="font-medium">{traceResult.affected.length}</span> asset
                                {traceResult.affected.length === 1 ? "" : "s"} affected
                            </p>

                            {traceResult.valvesToClose && traceResult.valvesToClose.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <p className="text-[11px] font-medium text-muted-foreground">Valves to close</p>
                                    {traceResult.valvesToClose.map((v) => (
                                        <div key={v.id} className="flex items-center justify-between gap-1 text-xs">
                                            <span>{v.name}</span>
                                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => skipValve(v.id)}>
                                                Skip
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!!traceResult.deadEnds && (
                                <p className="flex items-center gap-1 text-[11px] text-destructive">
                                    <AlertTriangle className="h-3 w-3" /> {traceResult.deadEnds} branch{traceResult.deadEnds === 1 ? "" : "es"} can&#39;t
                                    be isolated
                                </p>
                            )}

                            <div className="max-h-32 overflow-y-auto rounded-md border border-border p-1.5">
                                {traceResult.affected.map((n) => (
                                    <Link
                                        key={n.id}
                                        href={`/assets/${n.id}`}
                                        className="block truncate px-1 py-0.5 text-[11px] text-muted-foreground hover:text-primary hover:underline"
                                    >
                                        {n.name}
                                    </Link>
                                ))}
                            </div>

                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={clearTrace}>
                                Clear
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>New DMA</DialogTitle>
                        <DialogDescription>
                            The inlet meter becomes the trace controller — membership is computed from it, not from this
                            boundary alone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="dma-name">Name</Label>
                            <Input id="dma-name" value={pendingDma.name} onChange={(e) => setPendingDma((p) => ({ ...p, name: e.target.value }))} autoFocus />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label>Inlet meter</Label>
                            <Select value={pendingDma.inletMeterId} onValueChange={(v) => setPendingDma((p) => ({ ...p, inletMeterId: v }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {meterCandidates.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label>Boundary valves</Label>
                            <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
                                {valveCandidates.map((v) => (
                                    <label key={v.id} className="flex items-center gap-2 text-xs">
                                        <Checkbox
                                            checked={pendingDma.boundaryValveIds.includes(v.id)}
                                            onCheckedChange={() => toggleBoundaryValve(v.id)}
                                            className="h-3.5 w-3.5"
                                        />
                                        {v.name}
                                    </label>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">Valves that should stay closed to seal this DMA off.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={finishDma} disabled={!pendingDma.inletMeterId}>Save DMA</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}