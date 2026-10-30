import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
    ChevronRight, CircleCheck, CircleDot, ClipboardCheck, ClipboardList, CloudOff, GitPullRequest, Plus, RefreshCw, TriangleAlert, type LucideIcon,
} from "lucide-react-native";
import { AssetRow } from "../../../components/asset-row";
import { Button, Card, ConditionBadge, Divider, Screen, SectionHeader, StatusPill } from "../../../components/ui";
import { useApp } from "../../../lib/app-state";
import { timeAgo } from "../../../lib/assets";
import { MOCK_REVIEW_BRANCHES } from "../../../lib/mock-data";
import { can, ROLE_LABEL } from "../../../lib/permissions";
import { TAB_SPACE, useColors } from "../../../lib/theme";

function QuickAction({ icon: Icon, title, caption, soon, onPress }: { icon: LucideIcon; title: string; caption: string; soon?: boolean; onPress: () => void }) {
    const c = useColors();
    return (
        <Pressable onPress={onPress} accessibilityRole="button" className="min-h-[104px] flex-1 justify-between rounded-2xl border border-zinc-200 bg-white p-3.5 active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800">
            <View className="flex-row items-start justify-between">
                <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-600/20">
                    <Icon size={22} color={c.brand} />
                </View>
                {soon && (
                    <View className="rounded-full bg-zinc-200/70 px-2 py-0.5 dark:bg-zinc-800">
                        <Text className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Soon</Text>
                    </View>
                )}
            </View>
            <View>
                <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</Text>
                <Text numberOfLines={1} className="text-sm text-zinc-500 dark:text-zinc-400">{caption}</Text>
            </View>
        </Pressable>
    );
}

export default function HomeScreen() {
    const router = useRouter();
    const c = useColors();
    const { user, org, role, nodes, inspections, pending, awaitingReview, online, syncing, syncNow, lastSyncedAt, showToast } = useApp();

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const firstName = user.name.split(" ")[0];

    const attention = nodes
        .filter((n) => n.condition === "poor" || n.condition === "critical")
        .sort((a, b) => (a.condition === "critical" ? -1 : 1) - (b.condition === "critical" ? -1 : 1))
        .slice(0, 4);
    const recent = [...inspections].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 4);
    const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? "Asset";

    const writer = can.write(role);

    return (
        <Screen>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: TAB_SPACE + 16 }} showsVerticalScrollIndicator={false}>
                <View className="flex-row items-start justify-between gap-3 px-1 pb-4">
                    <View className="flex-1">
                        <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{greeting}, {firstName}</Text>
                        <Text numberOfLines={1} className="text-sm text-zinc-500 dark:text-zinc-400">{org.name} · {ROLE_LABEL[role]}</Text>
                    </View>
                    <StatusPill
                        onPress={() => router.push("/sync")}
                        tone={!online ? "warn" : pending > 0 ? "info" : "ok"}
                        icon={!online ? CloudOff : pending > 0 ? RefreshCw : CircleCheck}
                        label={!online ? `Offline${pending ? ` · ${pending}` : ""}` : pending > 0 ? `${pending} to upload` : "All synced"}
                    />
                </View>

                <Card className="gap-3 p-4">
                    <View className="flex-row items-center gap-3">
                        <View className="h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
                            {online ? <RefreshCw size={20} color={c.muted} /> : <CloudOff size={20} color="#b45309" />}
                        </View>
                        <View className="flex-1">
                            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                                {pending > 0 ? `${pending} change${pending === 1 ? "" : "s"} waiting to upload` : "Everything is uploaded"}
                            </Text>
                            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                                {online ? `Last synced ${timeAgo(lastSyncedAt)}` : "You're offline. Changes are kept on this phone."}
                            </Text>
                        </View>
                    </View>
                    <View className="flex-row gap-2">
                        <Button label={syncing ? "Syncing…" : "Sync now"} icon={RefreshCw} loading={syncing} disabled={!online || pending === 0} onPress={syncNow} className="h-12 flex-1" />
                        <Button label="Details" variant="secondary" onPress={() => router.push("/sync")} className="h-12 px-6" />
                    </View>
                </Card>

                {writer ? (
                    <>
                        <SectionHeader title="Quick actions" />
                        <View className="gap-3">
                            <View className="flex-row gap-3">
                                <QuickAction icon={ClipboardCheck} title="Record inspection" caption="Log an asset's condition" onPress={() => router.push({ pathname: "/select-asset", params: { purpose: "inspect" } })} />
                                <QuickAction icon={CircleDot} title="Operate valve" caption="Log open or closed" onPress={() => router.push({ pathname: "/select-asset", params: { purpose: "valve" } })} />
                            </View>
                            <View className="flex-row gap-3">
                                <QuickAction icon={Plus} title="Add asset" caption="Node, pipe or structure" onPress={() => router.push({ pathname: "/add-asset", params: { kind: "node" } })} />
                                <QuickAction
                                    icon={ClipboardList}
                                    title="Work orders"
                                    caption="Planned jobs"
                                    soon
                                    onPress={() => router.push({ pathname: "/placeholder", params: { title: "Work orders", note: "Inspections and valve replacements will become work orders you can pick up, complete and sign off. For now, record them directly." } })}
                                />
                            </View>
                        </View>
                    </>
                ) : (
                    <Card className="mt-6 flex-row items-center gap-3 p-4">
                        <Text className="flex-1 text-sm text-zinc-600 dark:text-zinc-400">You have view-only access. You can browse the network and its history but not change it.</Text>
                    </Card>
                )}

                {can.review(role) && (
                    <Pressable
                        onPress={() => router.push({ pathname: "/placeholder", params: { title: "Review changes", note: "Engineers and admins will compare each technician's changes with the live network here, resolve conflicts and approve them." } })}
                        accessibilityRole="button"
                        className="mt-3 flex-row items-center gap-3 rounded-2xl border border-brand-600/30 bg-brand-50 p-4 dark:border-brand-400/30 dark:bg-brand-600/15"
                    >
                        <GitPullRequest size={22} color={c.brand} />
                        <View className="flex-1">
                            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{MOCK_REVIEW_BRANCHES} sets of changes to review</Text>
                            <Text className="text-sm text-zinc-600 dark:text-zinc-400">Field edits waiting to go live</Text>
                        </View>
                        <ChevronRight size={18} color={c.muted} />
                    </Pressable>
                )}

                {awaitingReview > 0 && !can.review(role) && (
                    <Text className="mt-3 px-1 text-sm text-zinc-500 dark:text-zinc-400">{awaitingReview} of your changes are waiting for an engineer to review.</Text>
                )}

                <SectionHeader title="Needs attention" action="See all" onAction={() => router.navigate({ pathname: "/assets", params: { filter: "attention" } })} />
                <Card className="overflow-hidden">
                    {attention.length === 0 ? (
                        <View className="flex-row items-center gap-2 p-4">
                            <CircleCheck size={20} color="#047857" />
                            <Text className="text-base text-zinc-700 dark:text-zinc-300">Nothing in poor or critical condition.</Text>
                        </View>
                    ) : (
                        attention.map((n, i) => (
                            <View key={n.id}>
                                {i > 0 && <Divider />}
                                <AssetRow node={n} onPress={() => router.push(`/asset/${n.id}`)} />
                            </View>
                        ))
                    )}
                </Card>

                <SectionHeader title="Recent inspections" />
                <Card className="overflow-hidden">
                    {recent.map((r, i) => (
                        <View key={r.id}>
                            {i > 0 && <Divider />}
                            <Pressable onPress={() => router.push(`/asset/${r.assetId}`)} accessibilityRole="button" className="min-h-[68px] flex-row items-center gap-3 px-4 py-3 active:bg-zinc-100 dark:active:bg-zinc-800/60">
                                <View className="flex-1 gap-0.5">
                                    <Text numberOfLines={1} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{nameOf(r.assetId)}</Text>
                                    <Text numberOfLines={1} className="text-sm text-zinc-500 dark:text-zinc-400">{r.note ?? "No note"}</Text>
                                </View>
                                <View className="items-end gap-1">
                                    <ConditionBadge condition={r.condition} />
                                    <Text className="text-xs text-zinc-400">{timeAgo(r.recordedAt)}</Text>
                                </View>
                            </Pressable>
                        </View>
                    ))}
                </Card>

                <View className="mt-6 flex-row items-center justify-center gap-1.5">
                    <TriangleAlert size={14} color={c.faint} />
                    <Text className="text-xs text-zinc-400">Preview data. Nothing here is saved to a server yet.</Text>
                </View>
            </ScrollView>
        </Screen>
    );
}
