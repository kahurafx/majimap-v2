import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    Map as MapLibreMap,
    Camera,
    GeoJSONSource,
    Layer,
    type CameraRef,
} from "@maplibre/maplibre-react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import * as Location from "expo-location";
import { Search, Cloud, LocateFixed, Navigation } from "lucide-react-native";
import { mockNodes, CENTER } from "../../lib/mock-data";
import type { NodeType, NetworkNode, Condition } from "@majimap/shared-types";

const LIGHT_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const TYPE_COLOR: Record<NodeType, string> = {
    reservoir: "#38BDF8",
    pumping_station: "#A78BFA",
    valve: "#FB923C",
    junction: "#FACC15",
    meter: "#67E8F9",
    hydrant: "#FB7185",
};

const CONDITION_COLOR: Record<Condition, string> = {
    good: "#4ADE80",
    fair: "#FBBF24",
    poor: "#FB923C",
    critical: "#F87171",
    unknown: "#94A3B8",
};

const PILLS: { key: "all" | NodeType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "reservoir", label: "Reservoirs" },
    { key: "pumping_station", label: "Pumps" },
    { key: "valve", label: "Valves" },
    { key: "meter", label: "Meters" },
    { key: "hydrant", label: "Hydrants" },
];

function nodesGeoJSON(nodes: NetworkNode[]) {
    return {
        type: "FeatureCollection" as const,
        features: nodes.map((n) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [n.location.lng, n.location.lat] },
            properties: { id: n.id, name: n.name, type: n.type, condition: n.condition },
        })),
    };
}

export default function MapScreen() {
    const colorScheme = useColorScheme();
    const cameraRef = useRef<CameraRef>(null);
    const sheetRef = useRef<BottomSheet>(null);
    const [activeFilter, setActiveFilter] = useState<"all" | NodeType>("all");
    const [selected, setSelected] = useState<NetworkNode | null>(mockNodes.find((n) => n.id === "n-valve-3") ?? null);

    useEffect(() => {
        if (selected) sheetRef.current?.snapToIndex(0);
    }, []);

    const filter = activeFilter === "all" ? undefined : (["==", ["get", "type"], activeFilter] as any);

    const onNodePress = useCallback((event: any) => {
        event.stopPropagation?.();
        const feature = event.nativeEvent?.features?.[0];
        if (!feature) return;
        const node = mockNodes.find((n) => n.id === feature.properties?.id);
        if (node) {
            setSelected(node);
            sheetRef.current?.snapToIndex(0);
        }
    }, []);

    async function handleLocate() {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({});
        cameraRef.current?.setStop({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: 16,
            duration: 600,
        });
    }

    return (
        <SafeAreaView className="flex-1 bg-white dark:bg-zinc-950" edges={["top"]}>
            <View className="px-3.5 pt-2 pb-2.5 gap-2 bg-white dark:bg-zinc-950 z-10">
                <View className="flex-row items-center gap-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5">
                    <Search size={14} color="#9CA3AF" />
                    <TextInput placeholder="Search assets, IDs…" placeholderTextColor="#9CA3AF" className="flex-1 text-xs text-zinc-900 dark:text-zinc-50" />
                </View>

                <View className="flex-row items-center gap-1.5 self-start bg-amber-500/15 rounded-full px-2.5 py-1">
                    <Cloud size={11} color="#B45309" />
                    <Text className="text-[10.5px] font-semibold text-amber-700 dark:text-amber-400">Offline · 3 changes pending</Text>
                </View>

                <View className="flex-row gap-1.5">
                    {PILLS.map((p) => {
                        const active = activeFilter === p.key;
                        return (
                            <TouchableOpacity
                                key={p.key}
                                onPress={() => setActiveFilter(p.key)}
                                className={
                                    active
                                        ? "flex-row items-center gap-1.5 rounded-full px-3 py-1.5 bg-blue-600"
                                        : "flex-row items-center gap-1.5 rounded-full px-3 py-1.5 border border-zinc-200 dark:border-zinc-800"
                                }
                            >
                                {p.key !== "all" && <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TYPE_COLOR[p.key] }} />}
                                <Text className={active ? "text-[11px] font-medium text-white" : "text-[11px] text-zinc-500 dark:text-zinc-400"}>{p.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <View className="flex-1">
                <MapLibreMap
                    style={{ flex: 1 }}
                    mapStyle={colorScheme === "dark" ? DARK_STYLE : LIGHT_STYLE}
                    logo={false}
                    attribution={false}
                    compass={false}
                >
                    <Camera ref={cameraRef} initialViewState={{ center: [CENTER.lng, CENTER.lat], zoom: 15 }} />
                    <GeoJSONSource id="nodes" data={nodesGeoJSON(mockNodes)} onPress={onNodePress}>
                        <Layer
                            id="nodes-circle"
                            type="circle"
                            filter={filter}
                            paint={{
                                "circle-radius": 6,
                                "circle-color": [
                                    "match",
                                    ["get", "condition"],
                                    "good", CONDITION_COLOR.good,
                                    "fair", CONDITION_COLOR.fair,
                                    "poor", CONDITION_COLOR.poor,
                                    "critical", CONDITION_COLOR.critical,
                                    CONDITION_COLOR.unknown,
                                ],
                                "circle-stroke-width": 1.5,
                                "circle-stroke-color": "#ffffff",
                            }}
                        />
                    </GeoJSONSource>
                </MapLibreMap>

                <TouchableOpacity
                    onPress={handleLocate}
                    className="absolute right-3.5 bottom-6 h-10 w-10 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 items-center justify-center shadow-md"
                >
                    <LocateFixed size={18} color="#3B82F6" />
                </TouchableOpacity>
            </View>

            <BottomSheet ref={sheetRef} index={-1} snapPoints={["22%"]} enablePanDownToClose onClose={() => setSelected(null)}>
                <BottomSheetView className="px-4 pb-6">
                    {selected && (
                        <>
                            <View className="flex-row items-center gap-3">
                                <View className="h-10 w-10 rounded-xl items-center justify-center" style={{ backgroundColor: TYPE_COLOR[selected.type] }}>
                                    <Text className="text-xs font-bold text-zinc-950">{selected.type[0].toUpperCase()}</Text>
                                </View>
                                <View className="flex-1">
                                    <Text className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{selected.name}</Text>
                                    <Text className="text-[11px] text-zinc-500 dark:text-zinc-400">340m away</Text>
                                </View>
                                <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: CONDITION_COLOR[selected.condition] + "29" }}>
                                    <Text className="text-[9.5px] font-bold capitalize" style={{ color: CONDITION_COLOR[selected.condition] }}>
                                        {selected.condition}
                                    </Text>
                                </View>
                            </View>
                            <View className="flex-row gap-2 mt-3">
                                <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-1.5 bg-blue-600 rounded-xl py-2.5">
                                    <Navigation size={13} color="#fff" />
                                    <Text className="text-xs font-semibold text-white">Directions · 6 min</Text>
                                </TouchableOpacity>
                                <TouchableOpacity className="flex-1 items-center justify-center border border-zinc-200 dark:border-zinc-800 rounded-xl py-2.5">
                                    <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Details</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </BottomSheetView>
            </BottomSheet>
        </SafeAreaView>
    );
}