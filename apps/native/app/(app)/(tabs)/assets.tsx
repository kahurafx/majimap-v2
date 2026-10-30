import { useMemo, useState } from "react";
import { FlatList, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Search, SearchX } from "lucide-react-native";
import type { NodeType } from "@majimap/shared-types";
import { AssetRow } from "../../../components/asset-row";
import { Card, Chip, Divider, EmptyState, Screen } from "../../../components/ui";
import { useApp } from "../../../../native/lib/app-state";
import { NODE_TYPE_PLURAL, NODE_TYPES } from "../../../../native/lib/assets";
import { TAB_SPACE, useColors } from "../../../../native/lib/theme";

type Filter = "all" | "attention" | NodeType;

export default function AssetsScreen() {
    const router = useRouter();
    const c = useColors();
    const params = useLocalSearchParams<{ filter?: string }>();
    const { nodes } = useApp();
    const [query, setQuery] = useState("");
    const [chosen, setChosen] = useState<Filter | null>(null);
    // A link from Home ("See all") sets the filter; picking a chip overrides it.
    const filter: Filter = chosen ?? (params.filter === "attention" ? "attention" : "all");

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return nodes
            .filter((n) => (filter === "all" ? true : filter === "attention" ? n.condition === "poor" || n.condition === "critical" : n.type === filter))
            .filter((n) => !q || n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [nodes, query, filter]);

    return (
        <Screen>
            <View className="gap-3 px-4 pb-2 pt-2">
                <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Assets</Text>
                <View className="h-12 flex-row items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <Search size={18} color={c.muted} />
                    <TextInput value={query} onChangeText={setQuery} placeholder="Search by name or ID" placeholderTextColor={c.faint} autoCorrect={false} className="flex-1 text-base text-zinc-900 dark:text-zinc-50" />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
                    <Chip label="All" active={filter === "all"} onPress={() => setChosen("all")} />
                    <Chip label="Needs attention" active={filter === "attention"} onPress={() => setChosen("attention")} />
                    {NODE_TYPES.map((t) => (
                        <Chip key={t} label={NODE_TYPE_PLURAL[t]} active={filter === t} onPress={() => setChosen(t)} />
                    ))}
                </ScrollView>
                <Text className="px-1 text-sm text-zinc-500 dark:text-zinc-400">{rows.length} asset{rows.length === 1 ? "" : "s"}</Text>
            </View>

            <FlatList
                data={rows}
                keyExtractor={(n) => n.id}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: TAB_SPACE + 16 }}
                ListEmptyComponent={<EmptyState icon={SearchX} title="No assets match" body="Try a different search or filter." />}
                ItemSeparatorComponent={Divider}
                renderItem={({ item, index }) => (
                    <View className={`overflow-hidden border-x border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${index === 0 ? "rounded-t-2xl border-t" : ""} ${index === rows.length - 1 ? "rounded-b-2xl border-b" : ""}`}>
                        <AssetRow node={item} onPress={() => router.push(`/asset/${item.id}`)} />
                    </View>
                )}
            />
        </Screen>
    );
}
