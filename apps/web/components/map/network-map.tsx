"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createRoot } from "react-dom/client";
import { useTheme } from "next-themes";
import { booleanPointInPolygon, point as turfPoint, polygon as turfPolygon } from "@turf/turf";
import { GeoJSON } from "geojson";
import { toast } from "sonner";

import { mockNodes, mockPipes, mockZones, CENTER, ZONE_COLORS, type Zone } from "@/lib/mock-data";
import { CONDITION_HEX } from "@/components/condition-badge";
import type { NodeType, NetworkNode } from "@majimap/shared-types";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Layers, MapPin, Pencil, Check, X } from "lucide-react";

const NODE_SOURCE_ID = "nodes";
const PIPE_SOURCE_ID = "pipes";
const ZONE_SOURCE_ID = "zones";
const ZONE_DRAFT_LINE_SOURCE_ID = "zone-draft-line";
const ZONE_DRAFT_FILL_SOURCE_ID = "zone-draft-fill";

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

type DraftPoint = { lat: number; lng: number };

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

function zonesGeoJSON(zones: Zone[]) {
    return {
        type: "FeatureCollection" as const,
        features: zones.map((z) => ({
            type: "Feature" as const,
            geometry: { type: "Polygon" as const, coordinates: [z.ring.map((p) => [p.lng, p.lat])] },
            properties: { id: z.id, name: z.name, color: z.color },
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
    const themeResolved = resolvedTheme !== undefined;

    const [ready, setReady] = useState(false);
    const [nodes, setNodes] = useState<NetworkNode[]>(mockNodes);
    const [visibleTypes, setVisibleTypes] = useState<Set<NodeType>>(new Set(NODE_TYPES));
    const [zones, setZones] = useState<Zone[]>(mockZones);
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [draftPoints, setDraftPoints] = useState<DraftPoint[]>([]);
    const [nameDialogOpen, setNameDialogOpen] = useState(false);
    const [pendingZoneName, setPendingZoneName] = useState("");

    // Refs mirroring state so the (mostly one-time) maplibre event handlers
    // always read the latest values instead of a stale closure.
    const nodesRef = useRef(nodes);
    const zonesRef = useRef(zones);
    const selectedZoneIdRef = useRef(selectedZoneId);
    const isDrawingRef = useRef(isDrawing);
    const draftPointsRef = useRef(draftPoints);
    const visibleTypesRef = useRef(visibleTypes);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { zonesRef.current = zones; }, [zones]);
    useEffect(() => { selectedZoneIdRef.current = selectedZoneId; }, [selectedZoneId]);
    useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);
    useEffect(() => { draftPointsRef.current = draftPoints; }, [draftPoints]);
    useEffect(() => { visibleTypesRef.current = visibleTypes; }, [visibleTypes]);

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

    // Map creation — waits until next-themes has actually resolved the theme
    // (it's `undefined` for a beat after mount) so the map is built with the
    // correct style from the start. `themeResolved` only ever flips false→true
    // once, so this never re-fires or tears the map down on later toggles.
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
            m.addSource(ZONE_SOURCE_ID, { type: "geojson", data: zonesGeoJSON(zonesRef.current) });
            m.addLayer({
                id: "zones-fill",
                type: "fill",
                source: ZONE_SOURCE_ID,
                paint: {
                    "fill-color": ["get", "color"],
                    "fill-opacity": ["case", ["==", ["get", "id"], selectedZoneIdRef.current ?? "__none__"], 0.22, 0.08],
                },
            });
            m.addLayer({
                id: "zones-line",
                type: "line",
                source: ZONE_SOURCE_ID,
                paint: {
                    "line-color": ["get", "color"],
                    "line-width": ["case", ["==", ["get", "id"], selectedZoneIdRef.current ?? "__none__"], 2.5, 1],
                },
            });

            m.addSource(ZONE_DRAFT_FILL_SOURCE_ID, { type: "geojson", data: draftFillGeoJSON(draftPointsRef.current) });
            m.addLayer({
                id: "zone-draft-fill",
                type: "fill",
                source: ZONE_DRAFT_FILL_SOURCE_ID,
                paint: { "fill-color": "#0EA5E9", "fill-opacity": 0.15 },
            });
            m.addSource(ZONE_DRAFT_LINE_SOURCE_ID, { type: "geojson", data: draftLineGeoJSON(draftPointsRef.current) });
            m.addLayer({
                id: "zone-draft-line",
                type: "line",
                source: ZONE_DRAFT_LINE_SOURCE_ID,
                paint: { "line-color": "#0EA5E9", "line-width": 2, "line-dasharray": [2, 1] },
            });

            m.addSource(PIPE_SOURCE_ID, { type: "geojson", data: pipesGeoJSON() });
            m.addLayer({
                id: "pipes-line",
                type: "line",
                source: PIPE_SOURCE_ID,
                paint: {
                    "line-width": ["interpolate", ["linear"], ["get", "diameterMm"], 100, 2, 400, 5],
                    "line-color": [
                        "match",
                        ["get", "condition"],
                        "good", CONDITION_HEX.good,
                        "fair", CONDITION_HEX.fair,
                        "poor", CONDITION_HEX.poor,
                        "critical", CONDITION_HEX.critical,
                        CONDITION_HEX.unknown,
                    ],
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
                    "circle-color": [
                        "match",
                        ["get", "condition"],
                        "good", CONDITION_HEX.good,
                        "fair", CONDITION_HEX.fair,
                        "poor", CONDITION_HEX.poor,
                        "critical", CONDITION_HEX.critical,
                        CONDITION_HEX.unknown,
                    ],
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
            openNodePopup(e);
        });
        map.on("click", "zones-fill", (e) => {
            if (isDrawingRef.current) return;
            const f = e.features?.[0];
            if (!f) return;
            const id = f.properties?.id as string;
            setSelectedZoneId((prev) => (prev === id ? null : id));
        });
        map.on("click", (e) => {
            if (!isDrawingRef.current) return;
            setDraftPoints((prev) => [...prev, { lat: e.lngLat.lat, lng: e.lngLat.lng }]);
        });
        map.on("mouseenter", "nodes-circle", () => {
            if (!isDrawingRef.current) map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "nodes-circle", () => {
            map.getCanvas().style.cursor = isDrawingRef.current ? "crosshair" : "";
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

    // Genuine theme *toggles* (after the map already exists and has finished
    // its first load) swap the basemap style and re-add our layers.
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

    // Layer visibility (checkbox filters).
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const arr = Array.from(visibleTypes);
        map.setFilter("nodes-circle", arr.length ? ["in", ["get", "type"], ["literal", arr]] : ["==", ["get", "type"], "__none__"]);
    }, [visibleTypes, ready]);

    // Push node edits (quick actions) into the map.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        (map.getSource(NODE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(nodesGeoJSON(nodes));
    }, [nodes, ready]);

    // Push zone edits (new drawn zones) into the map.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        (map.getSource(ZONE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(zonesGeoJSON(zones));
    }, [zones, ready]);

    // Emphasize the selected zone's boundary.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const sel = selectedZoneId ?? "__none__";
        map.setPaintProperty("zones-fill", "fill-opacity", ["case", ["==", ["get", "id"], sel], 0.22, 0.08]);
        map.setPaintProperty("zones-line", "line-width", ["case", ["==", ["get", "id"], sel], 2.5, 1]);
    }, [selectedZoneId, ready]);

    // Dim assets outside the selected zone, and fit the map to it.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        if (!selectedZoneId) {
            map.setPaintProperty("nodes-circle", "circle-opacity", 1);
            return;
        }
        const zone = zones.find((z) => z.id === selectedZoneId);
        if (!zone) return;
        const poly = turfPolygon([zone.ring.map((p) => [p.lng, p.lat])]);
        const insideIds = nodes
            .filter((n) => booleanPointInPolygon(turfPoint([n.location.lng, n.location.lat]), poly))
            .map((n) => n.id);
        map.setPaintProperty(
            "nodes-circle",
            "circle-opacity",
            insideIds.length ? ["case", ["in", ["get", "id"], ["literal", insideIds]], 1, 0.25] : 0.25,
        );
        const lngs = zone.ring.map((p) => p.lng);
        const lats = zone.ring.map((p) => p.lat);
        map.fitBounds(
            [
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: 60, duration: 600 },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedZoneId, ready]);

    // Live preview while drawing a new zone boundary.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        (map.getSource(ZONE_DRAFT_LINE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(draftLineGeoJSON(draftPoints));
        (map.getSource(ZONE_DRAFT_FILL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData(draftFillGeoJSON(draftPoints));
    }, [draftPoints, ready]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        map.getCanvas().style.cursor = isDrawing ? "crosshair" : "";
    }, [isDrawing]);

    function toggleType(type: NodeType) {
        setVisibleTypes((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    }

    function startDrawing() {
        setIsDrawing(true);
        setDraftPoints([]);
        setSelectedZoneId(null);
    }

    function cancelDrawing() {
        setIsDrawing(false);
        setDraftPoints([]);
    }

    function openNameDialog() {
        if (draftPoints.length < 3) return;
        setPendingZoneName(`Zone ${zones.length + 1}`);
        setNameDialogOpen(true);
    }

    function finishZone() {
        if (draftPoints.length < 3) return;
        const newZone: Zone = {
            id: `zone-${Date.now()}`,
            name: pendingZoneName.trim() || `Zone ${zones.length + 1}`,
            color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
            ring: [...draftPoints, draftPoints[0]],
        };
        setZones((prev) => [...prev, newZone]);
        setIsDrawing(false);
        setDraftPoints([]);
        setNameDialogOpen(false);
        toast.success(`${newZone.name} created`);
    }

    return (
        <div className="relative h-dvh w-full">
            <div ref={containerRef} className="h-full w-full" />

            <Card className="absolute left-3 top-3 z-10 w-56 gap-0 border-border/60 bg-card/95 py-3 shadow-md backdrop-blur">
                <CardHeader className="px-3 pb-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Layers className="h-3.5 w-3.5" /> Layers
                    </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-1.5 px-3 pb-2">
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
                        <MapPin className="h-3.5 w-3.5" /> Zones
                    </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-1 px-3 pb-2">
                    {zones.map((z) => (
                        <button
                            key={z.id}
                            onClick={() => setSelectedZoneId((prev) => (prev === z.id ? null : z.id))}
                            className={cn(
                                "flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted",
                                selectedZoneId === z.id && "bg-muted font-medium",
                            )}
                        >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: z.color }} />
                            {z.name}
                        </button>
                    ))}

                    {!isDrawing ? (
                        <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={startDrawing}>
                            <Pencil className="mr-1.5 h-3 w-3" /> Draw zone
                        </Button>
                    ) : (
                        <div className="mt-2 flex flex-col gap-1.5">
                            <p className="text-[11px] text-muted-foreground">Click the map to add points ({draftPoints.length})</p>
                            <div className="flex gap-1.5">
                                <Button size="sm" className="h-7 flex-1 text-xs" disabled={draftPoints.length < 3} onClick={openNameDialog}>
                                    <Check className="mr-1 h-3 w-3" /> Finish
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={cancelDrawing}>
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Name this zone</DialogTitle>
                        <DialogDescription>You can rename it later.</DialogDescription>
                    </DialogHeader>
                    <Input value={pendingZoneName} onChange={(e) => setPendingZoneName(e.target.value)} autoFocus />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNameDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={finishZone}>Save zone</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}