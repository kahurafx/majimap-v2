"use client";

import {useEffect, useRef, useState} from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {mockNodes, mockPipes} from "@/lib/mock-data";
import {CONDITION_HEX} from "@/components/condition-badge";
import type {NodeType} from "@majimap/shared-types";
import {GeoJSON} from "geojson";

const NODE_SOURCE_ID = "nodes";
const PIPE_SOURCE_ID = "pipes";

const NODE_TYPE_LABEL: Record<NodeType, string> = {
    reservoir: "Reservoirs",
    pumping_station: "Pumping stations",
    valve: "Valves",
    junction: "Junctions",
    meter: "Meters",
    hydrant: "Hydrants",
};

const NODE_TYPES = Object.keys(NODE_TYPE_LABEL) as NodeType[];

function nodesGeoJSON() {
    return {
        type: "FeatureCollection" as const,
        features: mockNodes.map((n) => ({
            type: "Feature" as const,
            geometry: {type: "Point" as const, coordinates: [n.location.lng, n.location.lat]},
            properties: {
                id: n.id,
                name: n.name,
                type: n.type,
                condition: n.condition,
                isOpen: n.isOpen,
            },
        })),
    };
}

function pipesGeoJSON() {
    return {
        type: "FeatureCollection" as const,
        features: mockPipes.map((p) => ({
            type: "Feature" as const,
            geometry: {
                type: "LineString" as const,
                coordinates: p.path.map((pt) => [pt.lng, pt.lat]),
            },
            properties: {
                id: p.id,
                material: p.material,
                diameterMm: p.diameterMm,
                condition: p.condition,
                lengthM: p.lengthM,
            },
        })),
    };
}

const NODE_RADIUS: Record<NodeType, number> = {
    reservoir: 9,
    pumping_station: 8,
    valve: 6,
    junction: 4,
    meter: 6,
    hydrant: 6,
};

maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

export function NetworkMap() {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [visibleTypes, setVisibleTypes] = useState<Set<NodeType>>(new Set(NODE_TYPES));
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: 'https://tiles.openfreemap.org/styles/positron',
            center: [36.8219, -1.2921],
            zoom: 15,
        });

        mapRef.current = map;

        map.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right");

        map.on("load", () => {
            map.addSource(PIPE_SOURCE_ID, {type: "geojson", data: pipesGeoJSON()});
            map.addLayer({
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

            map.addSource(NODE_SOURCE_ID, {type: "geojson", data: nodesGeoJSON()});
            map.addLayer({
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
                },
            });

            map.on("click", "nodes-circle", (e) => {
                const f = e.features?.[0];
                if (!f) return;
                const p = f.properties as Record<string, unknown>;
                const openLabel = p.isOpen === true ? "Open" : p.isOpen === false ? "Closed" : null;
                new maplibregl.Popup({closeButton: true})
                    .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
                    .setHTML(
                        `<div style="padding:10px 12px;min-width:160px;font-family:inherit">
              <div style="font-weight:600;font-size:13px">${p.name}</div>
              <div style="font-size:12px;color:#6b7280;text-transform:capitalize">${String(p.type).replace("_", " ")} · ${p.condition}</div>
              ${openLabel ? `<div style="font-size:12px;margin-top:4px">Valve: <strong>${openLabel}</strong></div>` : ""}
            </div>`,
                    )
                    .addTo(map);
            });

            map.on("mouseenter", "nodes-circle", () => (map.getCanvas().style.cursor = "pointer"));
            map.on("mouseleave", "nodes-circle", () => (map.getCanvas().style.cursor = ""));

            setReady(true);
        });

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const arr = Array.from(visibleTypes);
        map.setFilter("nodes-circle", arr.length ? ["in", ["get", "type"], ["literal", arr]] : ["==", ["get", "type"], "__none__"]);
    }, [visibleTypes, ready]);

    function toggleType(type: NodeType) {
        setVisibleTypes((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    }

    return (
        <div className="relative h-full w-full">
            <div ref={containerRef} className="h-screen w-full"/>
            <div
                className="absolute left-3 top-3 z-10 rounded-md border border-border bg-card/95 p-3 text-sm shadow-md backdrop-blur">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Layers</p>
                <div className="flex flex-col gap-1.5">
                    {NODE_TYPES.map((type) => (
                        <label key={type} className="flex items-center gap-2 text-xs">
                            <input
                                type="checkbox"
                                checked={visibleTypes.has(type)}
                                onChange={() => toggleType(type)}
                                className="h-3.5 w-3.5 accent-primary"
                            />
                            {NODE_TYPE_LABEL[type]}
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );
}
