import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ClipboardCheck, CircleCheck } from "lucide-react-native";
import { WorkOrderRow } from "../../components/work-order-row";
import { Card, Divider, EmptyState, Header, Screen, SectionHeader, Segmented } from "../../components/ui";
import { useApp } from "../../lib/app-state";
import { useLocation } from "../../lib/location";
import { rankOrders, type RankedOrder } from "../../lib/work-orders";

type Tab = "todo" | "done";

export default function WorkOrdersScreen() {
    const router = useRouter();
    const { workOrders, nodes } = useApp();
    const { point, status: gpsStatus, request } = useLocation();
    const [tab, setTab] = useState<Tab>("todo");

    const ranked = useMemo(() => rankOrders(workOrders, nodes, point), [workOrders, nodes, point]);
    const todo = ranked.filter((r) => r.order.status !== "completed");
    const done = ranked.filter((r) => r.order.status === "completed").sort((a, b) => (b.order.completion?.at ?? "").localeCompare(a.order.completion?.at ?? ""));

    const inProgress = todo.filter((r) => r.order.status === "in_progress");
    const upNext = todo.filter((r) => r.order.status === "pending");
    const onHold = todo.filter((r) => r.order.status === "blocked");

    const open = (r: RankedOrder) => router.push({ pathname: "/work-order/[id]", params: { id: r.order.id } });
    const group = (title: string, rows: RankedOrder[]) =>
        rows.length === 0 ? null : (
            <>
                <SectionHeader title={`${title} · ${rows.length}`} />
                <Card className="overflow-hidden">
                    {rows.map((r, i) => (
                        <View key={r.order.id}>
                            {i > 0 && <Divider />}
                            <WorkOrderRow item={r} onPress={() => open(r)} />
                        </View>
                    ))}
                </Card>
            </>
        );

    return (
        <Screen edges={["top", "bottom"]}>
            <Header title="Work orders" />
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: "todo", label: `To do · ${todo.length}` }, { value: "done", label: `Done · ${done.length}` }]} />

                {tab === "todo" ? (
                    todo.length === 0 ? (
                        <EmptyState icon={CircleCheck} title="No jobs waiting" body="New work orders appear here as soon as they're assigned to you." />
                    ) : (
                        <>
                            {group("In progress", inProgress)}
                            {group("Up next", upNext)}
                            {group("On hold", onHold)}
                            {gpsStatus !== "granted" && (
                                <Pressable onPress={request} accessibilityRole="button" className="mt-3 min-h-11 justify-center px-1">
                                    <Text className="text-sm font-medium text-brand-700 dark:text-brand-400">Turn on location to sort by what's closest</Text>
                                </Pressable>
                            )}
                        </>
                    )
                ) : done.length === 0 ? (
                    <EmptyState icon={ClipboardCheck} title="Nothing completed yet" body="Jobs you finish are kept here for reference." />
                ) : (
                    <View className="mt-4">
                        <Card className="overflow-hidden">
                            {done.map((r, i) => (
                                <View key={r.order.id}>
                                    {i > 0 && <Divider />}
                                    <WorkOrderRow item={r} onPress={() => open(r)} />
                                </View>
                            ))}
                        </Card>
                    </View>
                )}
            </ScrollView>
        </Screen>
    );
}