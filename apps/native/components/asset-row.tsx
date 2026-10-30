import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { NetworkNode, NodeType } from "@majimap/shared-types";
import { NODE_TYPE_COLOR, NODE_TYPE_ICON, NODE_TYPE_LABEL, inspectionState, timeAgo } from "../../native/lib/assets";
import { useColors } from "../../native/lib/theme";
import { ConditionBadge } from "./ui";

export function TypeTile({ type, size = 44 }: { type: NodeType; size?: number }) {
    const c = useColors();
    const Icon = NODE_TYPE_ICON[type];
    return (
        <View style={{ width: size, height: size, borderRadius: size / 3.2, backgroundColor: NODE_TYPE_COLOR[type] + "40" }} className="items-center justify-center">
            <Icon size={size * 0.48} color={c.text} />
        </View>
    );
}

export function caption(node: NetworkNode): string {
    const state = node.type === "valve" ? (node.isOpen === true ? "Open" : node.isOpen === false ? "Closed" : "State unknown") : null;
    const insp = inspectionState(node.lastInspectedAt);
    const inspected = insp === "never" ? "Never inspected" : insp === "overdue" ? `Overdue · ${timeAgo(node.lastInspectedAt)}` : `Inspected ${timeAgo(node.lastInspectedAt)}`;
    return [NODE_TYPE_LABEL[node.type], state, inspected].filter(Boolean).join(" · ");
}

export function AssetRow({ node, onPress }: { node: NetworkNode; onPress: () => void }) {
    const c = useColors();
    return (
        <Pressable onPress={onPress} accessibilityRole="button" className="min-h-[76px] flex-row items-center gap-3 px-4 py-3 active:bg-zinc-100 dark:active:bg-zinc-800/60">
            <TypeTile type={node.type} />
            <View className="flex-1 gap-0.5">
                <Text numberOfLines={1} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{node.name}</Text>
                <Text numberOfLines={1} className="text-sm text-zinc-500 dark:text-zinc-400">{caption(node)}</Text>
            </View>
            <ConditionBadge condition={node.condition} />
            <ChevronRight size={18} color={c.faint} />
        </Pressable>
    );
}
