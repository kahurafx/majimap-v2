import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Info, SearchX } from "lucide-react-native";
import { TypeTile } from "../../../components/asset-row";
import { Button, Card, EmptyState, Field, Footer, Header, Screen } from "../../../components/ui";
import { useApp } from "../../../../native/lib/app-state";

export default function OperateValve() {
    const { id, workOrderId } = useLocalSearchParams<{ id: string; workOrderId?: string }>();
    const router = useRouter();
    const { nodes, operateValve } = useApp();
    const node = nodes.find((n) => n.id === id && n.type === "valve");
    const [target, setTarget] = useState<boolean | null>(null);
    const [note, setNote] = useState("");

    if (!node) {
        return (
            <Screen edges={["top", "bottom"]}>
                <Header title="Operate valve" />
                <EmptyState icon={SearchX} title="Valve not found" />
            </Screen>
        );
    }

    const same = target !== null && target === node.isOpen;

    function save() {
        if (target === null) return;
        operateValve(node!.id, target, note, workOrderId);
        router.back();
    }

    const Choice = ({ open }: { open: boolean }) => {
        const active = target === open;
        const current = node!.isOpen === open;
        return (
            <Pressable
                onPress={() => setTarget(open)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                className={`h-28 flex-1 items-center justify-center gap-1 rounded-2xl border-2 ${active ? "border-brand-600 bg-brand-50 dark:bg-brand-600/15" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"}`}
            >
                <Text className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{open ? "Open" : "Closed"}</Text>
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">{current ? "Current state" : open ? "Water flows" : "Flow stopped"}</Text>
            </Pressable>
        );
    };

    return (
        <Screen edges={["top", "bottom"]}>
            <Header title="Operate valve" />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
                    <Card className="flex-row items-center gap-3 p-3.5">
                        <TypeTile type="valve" />
                        <View className="flex-1">
                            <Text numberOfLines={1} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{node.name}</Text>
                            <Text className="text-sm text-zinc-500 dark:text-zinc-400">Currently {node.isOpen === true ? "open" : node.isOpen === false ? "closed" : "in an unknown state"}</Text>
                        </View>
                    </Card>

                    <View className="gap-2">
                        <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">What did you do?</Text>
                        <View className="flex-row gap-3">
                            <Choice open />
                            <Choice open={false} />
                        </View>
                    </View>

                    {same && (
                        <View className="flex-row gap-2 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
                            <Info size={18} color="#71717a" />
                            <Text className="flex-1 text-sm text-zinc-600 dark:text-zinc-400">The valve is already recorded as {target ? "open" : "closed"}. You can still log it to confirm the state.</Text>
                        </View>
                    )}

                    <Field label="Note (optional)" value={note} onChangeText={setNote} multiline maxLength={2000} placeholder="Why was it operated? Turns counted, resistance, leaks…" />
                </ScrollView>
                <Footer>
                    <Button label={target === null ? "Choose open or closed" : `Log valve as ${target ? "open" : "closed"}`} disabled={target === null} onPress={save} />
                </Footer>
            </KeyboardAvoidingView>
        </Screen>
    );
}
