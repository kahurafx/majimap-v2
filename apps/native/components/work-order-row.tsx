import { Pressable, Text, View } from "react-native";
import { Check, ChevronRight, MapPin, MapPinOff } from "lucide-react-native";
import { timeAgo } from "../lib/assets";
import { KIND_ICON, dueLabel, formatDistance, type RankedOrder } from "../lib/work-orders";
import { useColors } from "../lib/theme";
import { StatusPill } from "./ui";

export function WorkOrderRow({ item, onPress }: { item: RankedOrder; onPress: () => void }) {
    const c = useColors();
    const { order, distanceM } = item;
    const Icon = KIND_ICON[order.kind];
    const completed = order.status === "completed";
    const due = dueLabel(order.dueAt);
    const where = distanceM !== null ? `${formatDistance(distanceM)} away` : (order.locationNote ?? "No location yet");

    return (
        <Pressable onPress={onPress} accessibilityRole="button" className="min-h-[92px] flex-row items-center gap-3 px-4 py-3 active:bg-zinc-100 dark:active:bg-zinc-800/60">
            <View className={`h-11 w-11 items-center justify-center rounded-xl ${completed ? "bg-emerald-100 dark:bg-emerald-500/20" : "bg-brand-50 dark:bg-brand-600/20"}`}>
                {completed ? <Check size={21} color="#047857" /> : <Icon size={21} color={c.brand} />}
            </View>
            <View className="flex-1 gap-0.5">
                <Text numberOfLines={1} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{order.title}</Text>
                {!completed && (
                    <View className="flex-row items-center gap-1.5">
                        {distanceM !== null ? <MapPin size={14} color={c.muted} /> : <MapPinOff size={14} color={c.faint} />}
                        <Text numberOfLines={1} className="flex-1 text-sm text-zinc-500 dark:text-zinc-400">{where}</Text>
                    </View>
                )}
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                    {order.code} ·{" "}
                    {completed ? (
                        `Done ${timeAgo(order.completion?.at)}`
                    ) : order.status === "blocked" ? (
                        order.hold?.reason
                    ) : (
                        <Text className={due.overdue ? "font-semibold text-red-700 dark:text-red-400" : ""}>{due.text}</Text>
                    )}
                </Text>
            </View>
            {order.status === "in_progress" ? <StatusPill label="In progress" tone="info" />
                : order.status === "blocked" ? <StatusPill label="On hold" tone="warn" />
                    : order.priority === "urgent" && !completed ? <StatusPill label="Urgent" tone="danger" />
                        : order.priority === "high" && !completed ? <StatusPill label="High" tone="warn" /> : null}
            <ChevronRight size={18} color={c.faint} />
        </Pressable>
    );
}