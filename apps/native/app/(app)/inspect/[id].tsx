import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Camera, Check, SearchX } from "lucide-react-native";
import { CONDITION_HEX, type Condition } from "@majimap/shared-types";
import { TypeTile } from "../../../components/asset-row";
import { Button, Card, EmptyState, Field, Footer, Header, Screen } from "../../../components/ui";
import { useApp } from "../../../../native/lib/app-state";
import { NODE_TYPE_LABEL } from "../../../../native/lib/assets";
import { CONDITION_HINT, CONDITION_LABEL, useColors } from "../../../../native/lib/theme";

const OPTIONS: Condition[] = ["good", "fair", "poor", "critical", "unknown"];

export default function RecordInspection() {
    const { id, workOrderId } = useLocalSearchParams<{ id: string; workOrderId?: string }>();
    const router = useRouter();
    const c = useColors();
    const { nodes, recordCondition } = useApp();
    const node = nodes.find((n) => n.id === id);
    const [condition, setCondition] = useState<Condition | null>(null);
    const [note, setNote] = useState("");

    if (!node) {
        return (
            <Screen edges={["top", "bottom"]}>
                <Header title="Record inspection" />
                <EmptyState icon={SearchX} title="Asset not found" />
            </Screen>
        );
    }

    function save() {
        if (!condition) return;
        recordCondition(node!.id, condition, note, workOrderId);
        router.back();
    }

    return (
        <Screen edges={["top", "bottom"]}>
            <Header title="Record inspection" />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
                    <Card className="flex-row items-center gap-3 p-3.5">
                        <TypeTile type={node.type} />
                        <View className="flex-1">
                            <Text numberOfLines={1} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{node.name}</Text>
                            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{NODE_TYPE_LABEL[node.type]} · currently {CONDITION_LABEL[node.condition].toLowerCase()}</Text>
                        </View>
                    </Card>

                    <View className="gap-2">
                        <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">What condition is it in?</Text>
                        <View className="flex-row flex-wrap gap-3">
                            {OPTIONS.map((o) => {
                                const active = condition === o;
                                return (
                                    <Pressable
                                        key={o}
                                        onPress={() => setCondition(o)}
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected: active }}
                                        style={{ width: "47.8%" }}
                                        className={`min-h-[88px] gap-1.5 rounded-2xl border-2 p-3.5 ${active ? "border-brand-600 bg-brand-50 dark:bg-brand-600/15" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"}`}
                                    >
                                        <View className="flex-row items-center justify-between">
                                            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: CONDITION_HEX[o] }} />
                                            {active && <Check size={18} color={c.brand} />}
                                        </View>
                                        <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{CONDITION_LABEL[o]}</Text>
                                        <Text className="text-sm text-zinc-500 dark:text-zinc-400">{CONDITION_HINT[o]}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>

                    <Field label="Note (optional)" value={note} onChangeText={setNote} multiline maxLength={2000} placeholder="What did you see? Leaks, corrosion, access problems…" hint={`${note.length}/2000`} />

                    <Button label="Add photo" variant="secondary" icon={Camera} onPress={() => {}} />
                    <Text className="-mt-3 text-center text-sm text-zinc-400">Photos arrive with the camera build.</Text>
                </ScrollView>
                <Footer>
                    <Button label="Save inspection" disabled={!condition} onPress={save} />
                    <Text className="pb-1 text-center text-sm text-zinc-400">Saved with the time on your phone. Uploads when you're online.</Text>
                </Footer>
            </KeyboardAvoidingView>
        </Screen>
    );
}
