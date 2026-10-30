import { useMemo, useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Search, SearchX } from "lucide-react-native";
import { AssetRow } from "../../components/asset-row";
import { Divider, EmptyState, Header, Screen } from "../../components/ui";
import { useApp } from "../../../native/lib/app-state";
import { useColors } from "../../../native/lib/theme";

/** Step one of "Record inspection" and "Operate valve" when started from Home or the + button. */
export default function SelectAsset() {
    const { purpose } = useLocalSearchParams<{ purpose?: "inspect" | "valve" }>();
    const router = useRouter();
    const c = useColors();
    const { nodes } = useApp();
    const [query, setQuery] = useState("");
    const valves = purpose === "valve";

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return nodes
            .filter((n) => (valves ? n.type === "valve" : true))
            .filter((n) => !q || n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
            // Longest since inspection first: what most needs a visit.
            .sort((a, b) => (a.lastInspectedAt ?? "").localeCompare(b.lastInspectedAt ?? ""));
    }, [nodes, query, valves]);

    return (
        <Screen edges={["top", "bottom"]}>
            <Header title={valves ? "Choose a valve" : "Choose an asset"} subtitle={valves ? undefined : "Longest since inspection first"} />
            <View className="px-4 pb-2">
                <View className="h-12 flex-row items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <Search size={18} color={c.muted} />
                    <TextInput value={query} onChangeText={setQuery} placeholder="Search by name or ID" placeholderTextColor={c.faint} autoCorrect={false} className="flex-1 text-base text-zinc-900 dark:text-zinc-50" />
                </View>
            </View>
            <FlatList
                data={rows}
                keyExtractor={(n) => n.id}
                ItemSeparatorComponent={Divider}
                ListEmptyComponent={<EmptyState icon={SearchX} title="Nothing found" body="Try a different name or ID." />}
                contentContainerStyle={{ paddingBottom: 24 }}
                renderItem={({ item }) => (
                    <AssetRow node={item} onPress={() => router.replace({ pathname: valves ? "/valve/[id]" : "/inspect/[id]", params: { id: item.id } })} />
                )}
            />
        </Screen>
    );
}
