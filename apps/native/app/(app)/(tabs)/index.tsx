import {useState} from "react";
import {LayoutAnimation, Pressable, ScrollView, Text, View} from "react-native";
import {useRouter} from "expo-router";
import {
    ChevronDown,
    ChevronRight,
    CircleCheck,
    ClipboardCheck,
    CloudOff,
    GitPullRequest,
    RefreshCw
} from "lucide-react-native";
import type {NetworkNode} from "@majimap/shared-types";
import {AssetRow, TypeTile} from "../../../components/asset-row";
import {WorkOrderRow} from "../../../components/work-order-row";
import {Button, Card, ConditionBadge, Divider, Screen, SectionHeader} from "../../../components/ui";
import {useApp} from "../../../lib/app-state";
import {inspectionState, timeAgo} from "../../../lib/assets";
import {can, ROLE_LABEL} from "../../../lib/permissions";
import {CONDITION_LABEL, TAB_SPACE, useColors} from "../../../lib/theme";
import {openOrders, rankOrders} from "../../../lib/work-orders";
import {useLocation} from "../../../lib/location";

/** Critical first, then poor, then whatever has gone longest without a visit. */
const rank = (n: NetworkNode) => (n.condition === "critical" ? 0 : n.condition === "poor" ? 1 : 2);

function reasonFor(n: NetworkNode): string | null {
    if (n.condition === "critical" || n.condition === "poor") return `${CONDITION_LABEL[n.condition]} condition · last inspected ${timeAgo(n.lastInspectedAt)}`;
    const state = inspectionState(n.lastInspectedAt);
    if (state === "never") return "Never inspected";
    if (state === "overdue") return `Inspection overdue · last done ${timeAgo(n.lastInspectedAt)}`;
    return null;
}

export default function HomeScreen() {

    const router = useRouter();
    const c = useColors();
    const {
        user,
        org,
        role,
        nodes,
        workOrders,
        pending,
        awaitingReview,
        online,
        syncing,
        syncNow,
        lastSyncedAt,
        branches
    } = useApp();
    const {point, status: gpsStatus, request: requestGps} = useLocation();
    const [syncOpen, setSyncOpen] = useState(false);

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const initials = user.name.split(" ").map((p) => p[0]).join("").slice(0, 2);

    // Assigned work comes first. With none, suggest the asset that most needs a visit.
    const open = openOrders(workOrders);
    const orders = rankOrders(open, nodes, point);
    const sorted = [...nodes].sort((a, b) => rank(a) - rank(b) || (a.lastInspectedAt ?? "").localeCompare(b.lastInspectedAt ?? ""));
    const top = sorted[0];
    const nextUp = orders.length === 0 && top && reasonFor(top) ? top : null;

    // Assets that already have a pending order are being handled, so don't repeat them.
    const covered = new Set(open.map((o) => o.assetId).filter(Boolean));
    const attention = nodes
        .filter((n) => (n.condition === "poor" || n.condition === "critical") && n.id !== nextUp?.id && !covered.has(n.id))
        .sort((a, b) => rank(a) - rank(b))
        .slice(0, 3);

    const toggleSync = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSyncOpen((o) => !o);
    };

    const syncTitle = !online ? "Offline" : pending > 0 ? `${pending} change${pending === 1 ? "" : "s"} to upload` : "All synced";
    const syncSub = online ? `Last synced ${timeAgo(lastSyncedAt)}` : pending > 0 ? `${pending} saved on this phone` : "Changes are saved on this phone";

    return (
        <Screen>
            <ScrollView contentContainerStyle={{paddingHorizontal: 16, paddingTop: 8, paddingBottom: TAB_SPACE + 16}}
                        showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View className="flex-row items-center justify-between gap-3 px-1 pb-5">
                    <View className="flex-1">
                        <Text
                            className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{greeting}, {user.name.split(" ")[0]}</Text>
                        <Text numberOfLines={1}
                              className="text-sm text-zinc-500 dark:text-zinc-400">{org.name} · {ROLE_LABEL[role]}</Text>
                    </View>
                    <Pressable
                        onPress={() => router.navigate("/profile")}
                        accessibilityRole="button"
                        accessibilityLabel="Open profile"
                        className="h-11 w-11 items-center justify-center rounded-full bg-brand-600 active:bg-brand-700"
                    >
                        <Text className="text-base font-bold text-white">{initials}</Text>
                    </Pressable>
                </View>

                {/* Sync: one quiet row, expands in place */}
                <Card className="overflow-hidden">
                    <Pressable
                        onPress={toggleSync}
                        accessibilityRole="button"
                        accessibilityState={{expanded: syncOpen}}
                        accessibilityLabel={`${syncTitle}. ${syncSub}`}
                        className="min-h-[60px] flex-row items-center gap-3 px-4 py-2.5 active:bg-zinc-100 dark:active:bg-zinc-800/60"
                    >
                        <View
                            className={`h-9 w-9 items-center justify-center rounded-full ${!online ? "bg-amber-100 dark:bg-amber-500/20" : pending > 0 ? "bg-brand-100 dark:bg-brand-600/25" : "bg-emerald-100 dark:bg-emerald-500/20"}`}>
                            {!online ? <CloudOff size={18} color="#b45309"/> : pending > 0 ?
                                <RefreshCw size={18} color={c.brand}/> : <CircleCheck size={18} color="#047857"/>}
                        </View>
                        <View className="flex-1">
                            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{syncTitle}</Text>
                            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{syncSub}</Text>
                        </View>
                        <View style={{transform: [{rotate: syncOpen ? "180deg" : "0deg"}]}}>
                            <ChevronDown size={20} color={c.faint}/>
                        </View>
                    </Pressable>

                    {syncOpen && (
                        <View className="gap-3 px-4 pb-4">
                            <Divider/>
                            <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                                {!online
                                    ? "You're offline. Everything you do is saved on this phone and uploads when you reconnect."
                                    : pending > 0
                                        ? "These changes are saved on this phone and haven't reached the server yet."
                                        : "Nothing is waiting. Changes you make are saved on this phone first, then uploaded."}
                                {awaitingReview > 0 && !can.review(role) ? ` ${awaitingReview} sent change${awaitingReview === 1 ? " is" : "s are"} waiting for an engineer to review.` : ""}
                            </Text>
                            <View className="flex-row gap-2">
                                <Button label={syncing ? "Syncing…" : "Sync now"} icon={RefreshCw} loading={syncing}
                                        disabled={!online || pending === 0} onPress={syncNow} className="h-12 flex-1"/>
                                <Button label="Details" variant="secondary" onPress={() => router.push("/sync")}
                                        className="h-12 flex-1"/>
                            </View>
                        </View>
                    )}
                </Card>

                {/* Pending work orders: the technician picks which to start */}
                {orders.length > 0 && (
                    <>
                        <SectionHeader
                            title={`Work orders · ${orders.length}`}
                            action="See all"
                            onAction={() => router.push("/work-orders")}
                        />
                        <Card className="overflow-hidden">
                            {orders.slice(0, 3).map((item, i) => (
                                <View key={item.order.id}>
                                    {i > 0 && <Divider/>}
                                    <WorkOrderRow
                                        item={item}
                                        onPress={() => router.push({
                                            pathname: "/work-order/[id]",
                                            params: {id: item.order.id}
                                        })}
                                    />

                                </View>
                            ))}
                        </Card>
                        {gpsStatus !== "granted" && (
                            <Pressable onPress={requestGps} accessibilityRole="button"
                                       className="mt-2 min-h-11 justify-center px-1">
                                <Text className="text-sm font-medium text-brand-700 dark:text-brand-400">Turn on
                                    location to see which jobs are closest</Text>
                            </Pressable>
                        )}
                    </>
                )}

                {/* No orders: suggest the one thing to do next */}
                {nextUp && (
                    <>
                        <SectionHeader title="Next up"/>
                        <Card className="gap-4 p-4">
                            <Pressable onPress={() => router.push(`/asset/${nextUp.id}`)} accessibilityRole="button"
                                       className="flex-row items-center gap-3">
                                <TypeTile type={nextUp.type} size={52}/>
                                <View className="flex-1 gap-1">
                                    <Text numberOfLines={1}
                                          className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{nextUp.name}</Text>
                                    <Text
                                        className="text-sm text-zinc-500 dark:text-zinc-400">{reasonFor(nextUp)}</Text>
                                </View>
                                <ChevronRight size={18} color={c.faint}/>
                            </Pressable>
                            <View className="flex-row">
                                <ConditionBadge condition={nextUp.condition}/>
                            </View>
                            {can.write(role) && <Button label="Record inspection" icon={ClipboardCheck}
                                                        onPress={() => router.push(`/inspect/${nextUp.id}`)}/>}
                        </Card>
                    </>
                )}

                {attention.length > 0 && (
                    <>
                        <SectionHeader title="Needs attention" action="See all" onAction={() => router.navigate({
                            pathname: "/assets",
                            params: {filter: "attention"}
                        })}/>
                        <Card className="overflow-hidden">
                            {attention.map((n, i) => (
                                <View key={n.id}>
                                    {i > 0 && <Divider/>}
                                    <AssetRow node={n} onPress={() => router.push(`/asset/${n.id}`)}/>
                                </View>
                            ))}
                        </Card>
                    </>
                )}

                {orders.length === 0 && !nextUp && attention.length === 0 && (
                    <Card className="mt-6 flex-row items-center gap-3 p-4">
                        <CircleCheck size={22} color="#047857"/>
                        <Text className="flex-1 text-base text-zinc-700 dark:text-zinc-300">You're all caught up.
                            Nothing needs attention right now.</Text>
                    </Card>
                )}

                {can.review(role) && branches.length > 0 && (
                    <Pressable
                        // onPress={() => router.push({
                        //     pathname: "/placeholder",
                        //     params: {
                        //         title: "Review changes",
                        //         note: "Engineers and admins will compare each technician's changes with the live network here, resolve conflicts and approve them."
                        //     }
                        // })}
                        onPressIn={() => router.push("/review")}
                        accessibilityRole="button"
                        className="mt-6 min-h-[64px] flex-row items-center gap-3 rounded-2xl border border-brand-600/30 bg-brand-50 px-4 py-3 dark:border-brand-400/30 dark:bg-brand-600/15"
                    >
                        <GitPullRequest size={22} color={c.brand}/>
                        <View className="flex-1">
                            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Review
                                changes</Text>
                            <Text
                                className="text-sm text-zinc-600 dark:text-zinc-400">{branches.length} set{branches.length === 1 ? "" : "s"} waiting</Text>
                        </View>
                        <ChevronRight size={18} color={c.muted}/>
                    </Pressable>
                )}
            </ScrollView>
        </Screen>
    );
}