import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Layers, LocateFixed, Navigation, Route as RouteIcon, Search, X } from "lucide-react-native";
import { traceDirectional, traceIsolation, traceSubnetworkMembership } from "@majimap/network";
import type { NodeType } from "@majimap/shared-types";
import { TypeTile, caption } from "../../../components/asset-row";
import { MapLayersSheet, type ColorMode } from "../../../components/map-layers-sheet";
import { MapTracePanel, type TraceMode, type TraceResult } from "../../../components/map-trace-panel";
import { NetworkMap, type MapHandle } from "../../../components/network-map";
import { Button, Card, Chip, ConditionBadge, Divider, StatusPill } from "../../../components/ui";
import { useApp } from "../../../lib/app-state";
import { NODE_TYPE_COLOR, NODE_TYPE_PLURAL, NODE_TYPES, approxMetres } from "../../../lib/assets";
import { openDirections } from "../../../lib/directions";
import { useLocation } from "../../../lib/location";
import { SUBNETWORK_PALETTE } from "../../../lib/map-style";
import { mockDmas, mockSubnetworks } from "../../../lib/mock-data"; // TODO: dmas.list / subnetworks.list once tRPC is wired
import { useColors } from "../../../lib/theme";

export default function MapScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const c = useColors();
    const { nodes, pipes, online, pending, showToast } = useApp();
    const { status: gpsStatus, point, request, refresh } = useLocation();
    const mapRef = useRef<MapHandle>(null);

    const [filter, setFilter] = useState<"all" | NodeType>("all");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedDmaId, setSelectedDmaId] = useState<string | null>(null);
    const [colorMode, setColorMode] = useState<ColorMode>("condition");
    const [showDmas, setShowDmas] = useState(true);
    const [showPipes, setShowPipes] = useState(true);
    const [layersOpen, setLayersOpen] = useState(false);
    const [query, setQuery] = useState("");

    const [traceMode, setTraceMode] = useState<TraceMode | null>(null);
    const [traceStart, setTraceStart] = useState<string | null>(null); // a node id, or a pipe id in isolation mode
    const [skipIds, setSkipIds] = useState<string[]>([]);

    const [panelH, setPanelH] = useState(48);

    // Layout: the floating tab bar, a line of map credit above it, then whatever panel is showing.
    const barTop = Math.max(insets.bottom, 12) + 76;
    const bottomBase = barTop + 24;
    const padding = { top: insets.top + 150, bottom: bottomBase + panelH + 24 };

    const selected = nodes.find((n) => n.id === selectedId) ?? null;
    const dma = mockDmas.find((d) => d.id === selectedDmaId) ?? null;

    /* ---------- derived: trace, DMA, subnetwork colours ---------- */

    const trace = useMemo<TraceResult | null>(() => {
        if (!traceMode || !traceStart) return null;
        if (traceMode === "isolation") {
            const r = traceIsolation(traceStart, nodes, pipes, skipIds);
            return { affected: r.affectedNodes, valvesToClose: r.valvesToClose, alreadyClosed: r.alreadyClosed, deadEnds: r.unisolatedSources.length };
        }
        return { affected: traceDirectional(traceStart, traceMode, nodes, pipes), valvesToClose: [], alreadyClosed: [], deadEnds: 0 };
    }, [traceMode, traceStart, skipIds, nodes, pipes]);

    const dmaTraced = useMemo(() => (dma ? traceDirectional(dma.inletMeterId, "downstream", nodes, pipes) : []), [dma, nodes, pipes]);
    const dmaOpenValves = useMemo(() => (dma ? dma.boundaryValveIds.filter((id) => nodes.find((n) => n.id === id)?.isOpen !== false) : []), [dma, nodes]);

    const subnetworks = useMemo(() => mockSubnetworks.map((s, i) => ({ ...s, color: SUBNETWORK_PALETTE[i % SUBNETWORK_PALETTE.length]! })), []);
    const subnetworkColors = useMemo(() => {
        const byId: Record<string, string> = {};
        for (const s of subnetworks) for (const m of traceSubnetworkMembership(s.controllerNodeId, nodes, pipes)) if (!(m.id in byId)) byId[m.id] = s.color;
        return byId;
    }, [subnetworks, nodes, pipes]);

    const highlightIds = trace ? [...trace.affected, ...trace.valvesToClose].map((n) => n.id) : dmaTraced.map((n) => n.id);
    const warningIds = trace ? trace.valvesToClose.map((n) => n.id) : dmaOpenValves;
    const failedPipeId = traceMode === "isolation" ? traceStart : null;

    // Frame whatever the trace or the selected DMA is about.
    useEffect(() => {
        if (trace && trace.affected.length) mapRef.current?.fitTo(trace.affected.map((n) => n.location));
    }, [trace]);
    useEffect(() => {
        if (dma) mapRef.current?.fitTo(dma.ring);
    }, [dma]);

    /* ---------- interactions ---------- */

    function onNodePress(id: string) {
        if (traceMode === "upstream" || traceMode === "downstream") return setTraceStart(id);
        if (traceMode === "isolation") return;
        setSelectedDmaId(null);
        setSelectedId(id);
    }
    function onPipePress(id: string) {
        if (traceMode === "isolation") {
            setTraceStart(id);
            setSkipIds([]);
        }
    }
    function onDmaPress(id: string) {
        if (traceMode) return;
        setSelectedId(null);
        setSelectedDmaId((prev) => (prev === id ? null : id));
    }
    function onBackground() {
        Keyboard.dismiss();
        if (!traceMode) {
            setSelectedId(null);
            setSelectedDmaId(null);
        }
    }

    function startTrace() {
        setTraceMode("isolation");
        setTraceStart(null);
        setSkipIds([]);
        setSelectedId(null);
        setSelectedDmaId(null);
    }
    function clearTrace() {
        setTraceMode(null);
        setTraceStart(null);
        setSkipIds([]);
    }
    function changeTraceMode(m: TraceMode) {
        setTraceMode(m);
        setTraceStart(null);
        setSkipIds([]);
    }

    async function locate() {
        if (gpsStatus !== "granted" && !(await request())) {
            showToast("Location is off. Turn it on in Settings to see where you are.");
            return;
        }
        const fix = await refresh();
        const here = fix?.point ?? point;
        if (here) mapRef.current?.flyTo(here, 16);
        else showToast("Couldn't get a GPS fix yet");
    }

    const q = query.trim().toLowerCase();
    const results = q ? nodes.filter((n) => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)).slice(0, 5) : [];
    const visibleCount = nodes.filter((n) => filter === "all" || n.type === filter).length;
    const distance = selected && point ? Math.round(approxMetres(point, selected.location)) : null;

    const roundBtn = "h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-md active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900";

    return (
        <View className="flex-1 bg-zinc-100 dark:bg-zinc-950">
            <NetworkMap
                ref={mapRef}
                nodes={nodes}
                pipes={pipes}
                dmas={mockDmas}
                selectedId={selectedId}
                selectedDmaId={selectedDmaId}
                filter={filter}
                colorMode={colorMode}
                subnetworkColors={subnetworkColors}
                showPipes={showPipes}
                showDmas={showDmas}
                highlightIds={highlightIds}
                warningIds={warningIds}
                failedPipeId={failedPipeId}
                showUserLocation={gpsStatus === "granted"}
                padding={padding}
                onNodePress={onNodePress}
                onPipePress={onPipePress}
                onDmaPress={onDmaPress}
                onBackgroundPress={onBackground}
            />

            {/* Top: search, status, filters */}
            <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, left: 12, right: 12, gap: 8 }}>
                <View className="h-12 flex-row items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3.5 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
                    <Search size={18} color={c.muted} />
                    <TextInput value={query} onChangeText={setQuery} placeholder="Search assets or IDs" placeholderTextColor={c.faint} autoCorrect={false} className="flex-1 text-base text-zinc-900 dark:text-zinc-50" />
                    {query ? (
                        <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={10}>
                            <X size={18} color={c.muted} />
                        </Pressable>
                    ) : null}
                </View>

                {q ? (
                    <Card className="overflow-hidden shadow-md">
                        {results.length === 0 ? (
                            <Text className="p-4 text-base text-zinc-500 dark:text-zinc-400">No asset matches “{query.trim()}”.</Text>
                        ) : (
                            results.map((n, i) => (
                                <View key={n.id}>
                                    {i > 0 && <Divider />}
                                    <Pressable
                                        onPress={() => { Keyboard.dismiss(); setQuery(""); setSelectedDmaId(null); setSelectedId(n.id); mapRef.current?.flyTo(n.location); }}
                                        accessibilityRole="button"
                                        className="min-h-14 flex-row items-center gap-3 px-3 py-2 active:bg-zinc-100 dark:active:bg-zinc-800/60"
                                    >
                                        <TypeTile type={n.type} size={36} />
                                        <Text numberOfLines={1} className="flex-1 text-base text-zinc-900 dark:text-zinc-50">{n.name}</Text>
                                        <ConditionBadge condition={n.condition} />
                                    </Pressable>
                                </View>
                            ))
                        )}
                    </Card>
                ) : (
                    <>
                        {(!online || pending > 0) && (
                            <StatusPill tone={online ? "info" : "warn"} label={online ? `${pending} changes to upload` : `Offline · ${pending} pending`} onPress={() => router.push("/sync")} />
                        )}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
                            <Chip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
                            {NODE_TYPES.map((t) => (
                                <Chip key={t} label={NODE_TYPE_PLURAL[t]} dot={NODE_TYPE_COLOR[t]} active={filter === t} onPress={() => setFilter(t)} />
                            ))}
                        </ScrollView>
                    </>
                )}
            </View>

            {/* Controls ride above whichever panel is showing */}
            <View pointerEvents="box-none" style={{ position: "absolute", right: 12, bottom: bottomBase + panelH + 12, gap: 10 }}>
                <Pressable onPress={() => setLayersOpen(true)} accessibilityLabel="Map layers" className={roundBtn}>
                    <Layers size={20} color={c.text} />
                </Pressable>
                <Pressable onPress={traceMode ? clearTrace : startTrace} accessibilityLabel="Trace" className={traceMode ? "h-12 w-12 items-center justify-center rounded-full bg-brand-600 shadow-md" : roundBtn}>
                    <RouteIcon size={20} color={traceMode ? "#fff" : c.text} />
                </Pressable>
                <Pressable onPress={locate} accessibilityLabel="My location" className={roundBtn}>
                    <LocateFixed size={20} color={gpsStatus === "granted" ? c.brand : c.muted} />
                </Pressable>
            </View>

            {/* Bottom panel: trace > DMA > selected asset > count */}
            <View pointerEvents="box-none" onLayout={(e) => setPanelH(e.nativeEvent.layout.height)} style={{ position: "absolute", left: 12, right: 12, bottom: bottomBase }}>
                {traceMode ? (
                    <MapTracePanel
                        mode={traceMode}
                        onMode={changeTraceMode}
                        result={trace}
                        onSkip={(id) => setSkipIds((s) => [...s, id])}
                        onClear={clearTrace}
                        onOpen={(id) => router.push(`/asset/${id}`)}
                    />
                ) : dma ? (
                    <View className="gap-1 rounded-3xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                        <View className="flex-row items-center gap-2">
                            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dma.color }} />
                            <Text className="flex-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">{dma.name}</Text>
                            <Pressable onPress={() => setSelectedDmaId(null)} accessibilityLabel="Close" hitSlop={10}>
                                <X size={20} color={c.muted} />
                            </Pressable>
                        </View>
                        <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                            {dmaTraced.length} assets fed from its inlet meter
                            {dmaOpenValves.length > 0 ? ` · ${dmaOpenValves.length} boundary valve${dmaOpenValves.length === 1 ? "" : "s"} not confirmed closed` : " · sealed"}
                        </Text>
                    </View>
                ) : selected ? (
                    <View className="gap-3 rounded-3xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                        <View className="flex-row items-center gap-3">
                            <TypeTile type={selected.type} size={48} />
                            <View className="flex-1">
                                <Text numberOfLines={1} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{selected.name}</Text>
                                <Text numberOfLines={1} className="text-sm text-zinc-500 dark:text-zinc-400">
                                    {distance !== null ? `${distance < 1000 ? `${distance} m` : `${(distance / 1000).toFixed(1)} km`} away · ` : ""}{caption(selected).split(" · ")[1] ?? ""}
                                </Text>
                            </View>
                            <ConditionBadge condition={selected.condition} />
                        </View>
                        <View className="flex-row gap-2">
                            <Button label="Directions" icon={Navigation} onPress={() => openDirections(selected.location, selected.name)} className="h-12 flex-1" />
                            <Button label="Details" variant="secondary" onPress={() => router.push(`/asset/${selected.id}`)} className="h-12 flex-1" />
                        </View>
                    </View>
                ) : (
                    <View className="self-center rounded-full border border-zinc-200 bg-white px-5 py-3 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
                        <Text className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{visibleCount} assets</Text>
                    </View>
                )}
            </View>

            {/* Basemap credit, required by the CARTO and OpenStreetMap styles */}
            <View pointerEvents="none" style={{ position: "absolute", left: 12, bottom: barTop + 4 }} className="rounded bg-white/80 px-1.5 py-0.5 dark:bg-zinc-900/80">
                <Text className="text-[11px] text-zinc-600 dark:text-zinc-400">© OpenStreetMap contributors © CARTO</Text>
            </View>

            <MapLayersSheet
                visible={layersOpen}
                onClose={() => setLayersOpen(false)}
                colorMode={colorMode}
                onColorMode={setColorMode}
                showDmas={showDmas}
                onShowDmas={setShowDmas}
                showPipes={showPipes}
                onShowPipes={setShowPipes}
                subnetworks={subnetworks}
            />
        </View>
    );
}