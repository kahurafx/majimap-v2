import { useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { useColorScheme } from "react-native";
import { Camera, GeoJSONSource, Layer, Map as MapLibreMap, UserLocation, type CameraRef } from "@maplibre/maplibre-react-native";
import type { Dma, NodeType, Pipe, Point } from "@majimap/shared-types";
import type { AppNode } from "../lib/asset-rules";
import { boundsOf, dmasGeoJSON, nodesGeoJSON, pipesGeoJSON, selectionGeoJSON } from "../lib/geojson";
import {
    DARK_STYLE, LIGHT_STYLE, NODE_STROKE, SUBNETWORK_FALLBACK, WARNING_RED,
    conditionColorExpr, haloRadiusExpr, nodeRadiusExpr, pipeWidthExpr, subnetworkColorExpr, valveDotRadiusExpr,
} from "../lib/map-style";
import { CENTER } from "../lib/mock-data";
import { BRAND } from "../lib/theme";

export type MapHandle = {
    flyTo: (p: Point, zoom?: number) => void;
    fitTo: (points: Point[]) => void;
};

type FeaturePress = { nativeEvent?: { features?: { properties?: Record<string, unknown> | null }[] }; stopPropagation?: () => void };
const idOf = (e: FeaturePress) => e.nativeEvent?.features?.[0]?.properties?.id as string | undefined;

type Props = {
    ref?: Ref<MapHandle>;
    nodes: AppNode[];
    pipes: Pipe[];
    dmas: Dma[];
    selectedId: string | null;
    selectedDmaId: string | null;
    filter: "all" | NodeType;
    colorMode: "condition" | "subnetwork";
    subnetworkColors: Record<string, string>;
    showPipes: boolean;
    showDmas: boolean;
    /** Nodes to keep at full strength; everything else dims. Empty means no dimming. */
    highlightIds: string[];
    /** Nodes to ring in red (valves to close, open boundary valves). */
    warningIds: string[];
    failedPipeId: string | null;
    showUserLocation: boolean;
    /** What the overlays cover, so fits and flights land in the visible part. */
    padding: { top: number; bottom: number };
    onNodePress: (id: string) => void;
    onPipePress: (id: string) => void;
    onDmaPress: (id: string) => void;
    onBackgroundPress: () => void;
};

/**
 * The live network map. Layers follow network-map.tsx on the web: pipes coloured
 * by condition and sized by diameter, nodes sized by type with a white stroke,
 * DMAs as soft fills, red rings for warnings. Layers are declarative here, so a
 * basemap change (light/dark) re-applies them by itself.
 *
 * Invisible "hit" layers sit above the visible ones: the visible shapes are far
 * too small to tap with a finger. They use opacity 0.01 rather than 0 because
 * a layer drawn at zero opacity may be skipped when querying features.
 */
export function NetworkMap(props: Props) {
    const {
        ref, nodes, pipes, dmas, selectedId, selectedDmaId, filter, colorMode, subnetworkColors, showPipes, showDmas,
        highlightIds, warningIds, failedPipeId, showUserLocation, padding,
    } = props;
    const dark = useColorScheme() === "dark";
    const cameraRef = useRef<CameraRef>(null);

    const pad = useMemo(() => ({ top: padding.top, bottom: padding.bottom, left: 32, right: 32 }), [padding.top, padding.bottom]);

    useImperativeHandle(
        ref,
        () => ({
            flyTo: (p, zoom = 17) => cameraRef.current?.flyTo({ center: [p.lng, p.lat], zoom, padding: pad, duration: 700 }),
            fitTo: (points) => {
                const b = boundsOf(points);
                if (b) cameraRef.current?.fitBounds(b, { padding: pad, duration: 700 });
            },
        }),
        [pad],
    );

    // Frame the whole network once, on first load.
    const [initialView] = useState(() => {
        const b = boundsOf(nodes.map((n) => n.location));
        return b ? { bounds: b, padding: pad } : { center: [CENTER.lng, CENTER.lat] as [number, number], zoom: 15 };
    });

    const nodeData = useMemo(() => nodesGeoJSON(nodes), [nodes]);
    const pipeData = useMemo(() => pipesGeoJSON(pipes), [pipes]);
    const dmaData = useMemo(() => dmasGeoJSON(dmas), [dmas]);
    const selectionData = useMemo(() => selectionGeoJSON(nodes.find((n) => n.id === selectedId) ?? null), [nodes, selectedId]);

    const typeFilter = filter === "all" ? undefined : (["==", ["get", "type"], filter] as never);
    const valveFilter = (filter === "all" || filter === "valve" ? ["==", ["get", "type"], "valve"] : ["==", ["get", "type"], "__none__"]) as never;

    const dim = highlightIds.length ? ["case", ["in", ["get", "id"], ["literal", highlightIds]], 1, 0.2] : 1;
    const ring = (on: unknown, off: unknown) => (warningIds.length ? ["case", ["in", ["get", "id"], ["literal", warningIds]], on, off] : off);
    const nodeColor = colorMode === "condition" ? conditionColorExpr : subnetworkColorExpr(subnetworkColors);
    const pipeColor = failedPipeId ? ["case", ["==", ["get", "id"], failedPipeId], WARNING_RED, conditionColorExpr] : conditionColorExpr;
    const selDma = selectedDmaId ?? "__none__";

    return (
        <MapLibreMap
            style={{ flex: 1 }}
            mapStyle={dark ? DARK_STYLE : LIGHT_STYLE}
            logo={false}
            attribution={false} // credited as text by the screen: the CARTO/OSM styles require it, and the default button would sit under the tab bar
            compass={false}
            onPress={() => props.onBackgroundPress()}
        >
            <Camera ref={cameraRef} initialViewState={initialView} />

            {showDmas && (
                <GeoJSONSource id="dmas" data={dmaData} onPress={(e: FeaturePress) => { e.stopPropagation?.(); const id = idOf(e); if (id) props.onDmaPress(id); }}>
                    <Layer id="dmas-fill" type="fill" paint={{ "fill-color": ["get", "color"], "fill-opacity": ["case", ["==", ["get", "id"], selDma], 0.22, 0.08] } as never} />
                    <Layer id="dmas-line" type="line" paint={{ "line-color": ["get", "color"], "line-width": ["case", ["==", ["get", "id"], selDma], 2.5, 1] } as never} />
                </GeoJSONSource>
            )}

            {showPipes && (
                <GeoJSONSource id="pipes" data={pipeData} onPress={(e: FeaturePress) => { e.stopPropagation?.(); const id = idOf(e); if (id) props.onPipePress(id); }}>
                    <Layer id="pipes-line" type="line" layout={{ "line-cap": "round", "line-join": "round" } as never} paint={{ "line-width": pipeWidthExpr, "line-color": pipeColor } as never} />
                    <Layer id="pipes-hit" type="line" paint={{ "line-width": 22, "line-color": "#000000", "line-opacity": 0.01 } as never} />
                </GeoJSONSource>
            )}

            <GeoJSONSource id="selection" data={selectionData}>
                <Layer
                    id="selection-halo"
                    type="circle"
                    paint={{ "circle-radius": haloRadiusExpr, "circle-color": BRAND[500], "circle-opacity": 0.2, "circle-stroke-color": BRAND[600], "circle-stroke-width": 2.5 } as never}
                />
            </GeoJSONSource>

            <GeoJSONSource id="nodes" data={nodeData} onPress={(e: FeaturePress) => { e.stopPropagation?.(); const id = idOf(e); if (id) props.onNodePress(id); }}>
                <Layer
                    id="nodes-circle"
                    type="circle"
                    filter={typeFilter}
                    paint={{
                        "circle-radius": nodeRadiusExpr,
                        "circle-color": nodeColor,
                        "circle-opacity": dim,
                        "circle-stroke-width": ring(3.5, 2),
                        "circle-stroke-color": ring(WARNING_RED, NODE_STROKE),
                    } as never}
                />
                {/* Valve state: dark centre when closed, white otherwise (unknown reads as open, as the traces treat it). */}
                <Layer
                    id="valve-state"
                    type="circle"
                    filter={valveFilter}
                    paint={{ "circle-radius": valveDotRadiusExpr, "circle-color": ["case", ["==", ["get", "isOpen"], false], "#18181b", "#ffffff"], "circle-opacity": dim } as never}
                />
                <Layer id="nodes-hit" type="circle" filter={typeFilter} paint={{ "circle-radius": 22, "circle-color": "#000000", "circle-opacity": 0.01 } as never} />
            </GeoJSONSource>

            {showUserLocation && <UserLocation />}
        </MapLibreMap>
    );
}

export { SUBNETWORK_FALLBACK };