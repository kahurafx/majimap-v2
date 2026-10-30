import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight, CircleDot, ClipboardCheck, MapPin, MapPinOff, Navigation, SearchX, TriangleAlert } from "lucide-react-native";
import { TypeTile } from "../../../../components/asset-row";
import { Button, Card, ConditionBadge, EmptyState, Footer, Header, Screen, SectionHeader, StatusPill } from "../../../../components/ui";
import { useApp } from "../../../../lib/app-state";
import { approxMetres, formatCoords, timeAgo } from "../../../../lib/assets";
import { openDirections } from "../../../../lib/directions";
import { useLocation } from "../../../../lib/location";
import { can } from "../../../../lib/permissions";
import { useColors } from "../../../../lib/theme";
import { KIND_ICON, KIND_LABEL, OUTCOME_LABEL, dueLabel, formatDistance } from "../../../../lib/work-orders";

export default function WorkOrderDetail() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const c = useColors();
    const { workOrders, nodes, role } = useApp();
    const { point } = useLocation();
    const order = workOrders.find((o) => o.id === id);

    if (!order) {
        return (
            <Screen edges={["top", "bottom"]}>
                <Header title="Work order" />
                <EmptyState icon={SearchX} title="Work order not found" body="It may have been reassigned." />
            </Screen>
        );
    }

    const asset = nodes.find((n) => n.id === order.assetId);
    const place = order.location ?? asset?.location ?? null;
    const distance = point && place ? approxMetres(point, place) : null;
    const writer = can.write(role);
    const open = order.status !== "completed";
    const due = dueLabel(order.dueAt);
    const Icon = KIND_ICON[order.kind];

    // The job often IS the inspection or valve operation: one tap to the existing screen, linked to this job.
    const shortcut =
        asset && writer && open
            ? order.kind === "inspection"
                ? { label: "Record inspection", icon: ClipboardCheck, pathname: "/inspect/[id]" }
                : order.kind === "valve_replacement" && asset.type === "valve"
                  ? { label: "Log valve state", icon: CircleDot, pathname: "/valve/[id]" }
                  : null
            : null;

    return (
        <Screen edges={["top", "bottom"]}>
            <Header title={order.code} subtitle={KIND_LABEL[order.kind]} />
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                <Card className="gap-3 p-4">
                    <View className="flex-row items-start gap-3">
                        <View className="h-12 w-12 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-600/20">
                            <Icon size={24} color={c.brand} />
                        </View>
                        <Text className="flex-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">{order.title}</Text>
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                        {order.status === "pending" && <StatusPill label="Not started" tone="neutral" />}
                        {order.status === "in_progress" && <StatusPill label="In progress" tone="info" />}
                        {order.status === "blocked" && <StatusPill label="On hold" tone="warn" />}
                        {order.status === "completed" && <StatusPill label="Completed" tone="ok" />}
                        {order.priority === "urgent" && open && <StatusPill label="Urgent" tone="danger" />}
                        {order.priority === "high" && open && <StatusPill label="High priority" tone="warn" />}
                        {open && <StatusPill label={due.text} tone={due.overdue ? "danger" : "neutral"} />}
                    </View>
                </Card>

                {order.status === "blocked" && order.hold && (
                    <View className="mt-3 gap-1 rounded-2xl bg-amber-100 p-4 dark:bg-amber-500/15">
                        <View className="flex-row items-center gap-2">
                            <TriangleAlert size={18} color="#b45309" />
                            <Text className="text-base font-semibold text-amber-900 dark:text-amber-200">Not finished · {order.hold.reason}</Text>
                        </View>
                        {order.hold.note ? <Text className="text-sm text-amber-900 dark:text-amber-200">{order.hold.note}</Text> : null}
                        {order.hold.photoCount > 0 && <Text className="text-sm text-amber-900 dark:text-amber-200">{order.hold.photoCount} photo{order.hold.photoCount === 1 ? "" : "s"} attached</Text>}
                    </View>
                )}

                {order.status === "completed" && order.completion && (
                    <View className="mt-3 gap-1 rounded-2xl bg-emerald-100 p-4 dark:bg-emerald-500/15">
                        <Text className="text-base font-semibold text-emerald-900 dark:text-emerald-200">{OUTCOME_LABEL[order.completion.outcome]} · {timeAgo(order.completion.at)}</Text>
                        {order.completion.note ? <Text className="text-sm text-emerald-900 dark:text-emerald-200">{order.completion.note}</Text> : null}
                        {order.completion.photoCount > 0 && <Text className="text-sm text-emerald-900 dark:text-emerald-200">{order.completion.photoCount} photos attached</Text>}
                    </View>
                )}

                <SectionHeader title="Where" />
                <Card className="gap-3 p-4">
                    {place ? (
                        <>
                            <View className="flex-row items-center gap-3">
                                <MapPin size={20} color={c.brand} />
                                <View className="flex-1">
                                    <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{distance !== null ? `${formatDistance(distance)} away` : "Location known"}</Text>
                                    <Text className="text-sm text-zinc-500 dark:text-zinc-400">{order.locationNote ?? asset?.name ?? formatCoords(place)}</Text>
                                </View>
                            </View>
                            <Button label="Directions" icon={Navigation} variant="secondary" onPress={() => openDirections(place, order.title)} className="h-12" />
                        </>
                    ) : (
                        <View className="flex-row items-start gap-3">
                            <MapPinOff size={20} color={c.faint} style={{ marginTop: 2 }} />
                            <View className="flex-1">
                                <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{order.locationNote ?? "No location given"}</Text>
                                <Text className="text-sm text-zinc-500 dark:text-zinc-400">This job came in without a GPS position. Use the description to find it.</Text>
                            </View>
                        </View>
                    )}
                </Card>

                {asset && (
                    <Pressable onPress={() => router.push(`/asset/${asset.id}`)} accessibilityRole="button" className="mt-3 min-h-[76px] flex-row items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800">
                        <TypeTile type={asset.type} />
                        <View className="flex-1">
                            <Text className="text-sm text-zinc-500 dark:text-zinc-400">Asset</Text>
                            <Text numberOfLines={1} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{asset.name}</Text>
                        </View>
                        <ConditionBadge condition={asset.condition} />
                        <ChevronRight size={18} color={c.faint} />
                    </Pressable>
                )}

                {shortcut && (
                    <Button
                        label={shortcut.label}
                        icon={shortcut.icon}
                        variant="secondary"
                        onPress={() => router.push({ pathname: shortcut.pathname, params: { id: asset!.id, workOrderId: order.id } })}
                        className="mt-3"
                    />
                )}

                <SectionHeader title="Details" />
                <Card className="gap-2 p-4">
                    <Text className="text-base text-zinc-700 dark:text-zinc-300">{order.description}</Text>
                    <Text className="text-sm text-zinc-400">{order.source} · raised {timeAgo(order.createdAt)}</Text>
                </Card>
            </ScrollView>

            {writer && open && (
                <Footer>
                    <View className="flex-row gap-2">
                        <Button label="Couldn't finish" variant="secondary" onPress={() => router.push({ pathname: "/work-order/[id]/finish", params: { id: order.id, mode: "incomplete" } })} className="flex-1" />
                        <Button label="Mark complete" onPress={() => router.push({ pathname: "/work-order/[id]/finish", params: { id: order.id, mode: "complete" } })} className="flex-1" />
                    </View>
                </Footer>
            )}
        </Screen>
    );
}