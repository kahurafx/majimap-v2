import { Pressable, ScrollView, Text, View } from "react-native";
import { TriangleAlert, X } from "lucide-react-native";
import type { AppNode } from "../lib/asset-rules";
import { useColors } from "../lib/theme";
import { Button, Segmented } from "./ui";

export type TraceMode = "upstream" | "downstream" | "isolation";
export type TraceResult = { affected: AppNode[]; valvesToClose: AppNode[]; alreadyClosed: AppNode[]; deadEnds: number };

/**
 * Field version of the web Trace card. Isolation answers "if this pipe
 * breaks, which valves do I close?", with a way out when a valve won't turn.
 * Runs the same shared algorithms as the server, on the phone, offline.
 */
export function MapTracePanel({
                                  mode, onMode, result, onSkip, onClear, onOpen,
                              }: {
    mode: TraceMode; onMode: (m: TraceMode) => void; result: TraceResult | null;
    onSkip: (valveId: string) => void; onClear: () => void; onOpen: (id: string) => void;
}) {
    const c = useColors();
    const shown = result?.affected.slice(0, 4) ?? [];
    return (
        <View className="gap-3 rounded-3xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Trace</Text>
                <Pressable onPress={onClear} accessibilityLabel="Close trace" hitSlop={10} className="h-9 w-9 items-center justify-center">
                    <X size={20} color={c.muted} />
                </Pressable>
            </View>
            <Segmented<TraceMode> value={mode} onChange={onMode} options={[{ value: "isolation", label: "Isolation" }, { value: "downstream", label: "Downstream" }, { value: "upstream", label: "Upstream" }]} />

            {!result ? (
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                    {mode === "isolation" ? "Tap a pipe on the map to simulate a break." : "Tap an asset on the map to start."}
                </Text>
            ) : (
                <ScrollView style={{ maxHeight: 250 }} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
                    <Text className="text-base text-zinc-900 dark:text-zinc-50">
                        <Text className="font-bold">{result.affected.length}</Text> asset{result.affected.length === 1 ? "" : "s"} affected
                    </Text>

                    {result.deadEnds > 0 && (
                        <View className="flex-row gap-2 rounded-xl bg-red-100 p-3 dark:bg-red-500/15">
                            <TriangleAlert size={18} color="#b91c1c" />
                            <Text className="flex-1 text-sm text-red-800 dark:text-red-300">
                                {result.deadEnds === 1 ? "A supply source is" : `${result.deadEnds} supply sources are`} connected to the break with no valve in between. Closing valves won't isolate it.
                            </Text>
                        </View>
                    )}

                    {result.valvesToClose.length > 0 && (
                        <View className="gap-1">
                            <Text className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Valves to close</Text>
                            {result.valvesToClose.map((v) => (
                                <View key={v.id} className="min-h-12 flex-row items-center justify-between gap-2">
                                    <Text numberOfLines={1} className="flex-1 text-base text-zinc-900 dark:text-zinc-50">{v.name}</Text>
                                    <Button label="Won't turn" variant="ghost" onPress={() => onSkip(v.id)} className="h-10 px-3" />
                                </View>
                            ))}
                        </View>
                    )}

                    {result.alreadyClosed.length > 0 && (
                        <Text className="text-sm text-zinc-500 dark:text-zinc-400">Already closed: {result.alreadyClosed.map((v) => v.name).join(", ")}</Text>
                    )}

                    <View className="gap-0.5">
                        {shown.map((n) => (
                            <Pressable key={n.id} onPress={() => onOpen(n.id)} accessibilityRole="button" className="min-h-11 justify-center">
                                <Text numberOfLines={1} className="text-base text-brand-700 dark:text-brand-400">{n.name}</Text>
                            </Pressable>
                        ))}
                        {result.affected.length > shown.length && <Text className="text-sm text-zinc-400">and {result.affected.length - shown.length} more</Text>}
                    </View>
                </ScrollView>
            )}
        </View>
    );
}