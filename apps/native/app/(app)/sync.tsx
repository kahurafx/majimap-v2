import {ScrollView, Text, View} from "react-native";
import {
    CircleCheck,
    Cloud,
    CloudOff,
    GitPullRequest,
    RefreshCw,
    TriangleAlert,
    type LucideIcon
} from "lucide-react-native";
import {Button, Card, Divider, EmptyState, Header, Screen, SectionHeader, StatusPill} from "../../components/ui";
import {useApp} from "../../lib/app-state";
import {timeAgo} from "../../lib/assets";
import type {SyncItem, SyncStatus} from "../../lib/mock-data";
import {useColors} from "../../lib/theme";
import {useRouter} from "expo-router";
import {can} from "../../lib/permissions";

/** Plain-language versions of the server's outcomes. */
const OUTCOME: Record<SyncStatus, {
    label: string;
    tone: "neutral" | "info" | "ok" | "warn" | "danger";
    hint?: string
}> = {
    queued: {label: "Waiting", tone: "info"},
    failed: {label: "Failed", tone: "danger"},
    applied: {label: "Saved", tone: "ok"},
    unchanged: {label: "No change needed", tone: "neutral"},
    stale: {label: "Kept as history", tone: "warn"},
    replayed: {label: "Already received", tone: "neutral"},
};

function Row({item, onRetry}: { item: SyncItem; onRetry?: () => void }) {
    const o = OUTCOME[item.status];
    return (
        <View className="gap-1.5 px-4 py-3.5">
            <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                    <Text
                        className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{item.title} · {item.assetName}</Text>
                    <Text className="text-sm text-zinc-500 dark:text-zinc-400">{item.detail} · {timeAgo(item.at)}</Text>
                </View>
                <StatusPill label={o.label} tone={o.tone}/>
            </View>
            {item.error ? <Text className="text-sm text-red-700 dark:text-red-400">{item.error}</Text> : o.hint ?
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">{o.hint}</Text> : null}
            {item.status === "failed" && onRetry ?
                <Button label="Try again" variant="secondary" icon={RefreshCw} onPress={onRetry}
                        className="mt-1 h-12"/> : null}
        </View>
    );
}

function Group({title, icon: Icon, items, empty, onRetry}: {
    title: string;
    icon: LucideIcon;
    items: SyncItem[];
    empty: string;
    onRetry?: () => void
}) {
    const c = useColors();
    return (
        <>
            <SectionHeader title={title}/>
            <Card className="overflow-hidden">
                {items.length === 0 ? (
                    <EmptyState icon={Icon} title={empty}/>
                ) : (
                    items.map((i, idx) => (
                        <View key={i.id}>
                            {idx > 0 && <Divider/>}
                            <Row item={i} onRetry={onRetry}/>
                        </View>
                    ))
                )}
            </Card>
        </>
    );
}

export default function SyncScreen() {
    const router = useRouter();

    const c = useColors();
    const {queue, pending, awaitingReview, online, syncing, syncNow, lastSyncedAt, role} = useApp();

    const onDevice = queue.filter((i) => i.status === "queued" || i.status === "failed");
    const waitingReview = queue.filter((i) => i.status === "applied" && !i.reviewed);
    const done = queue.filter((i) => !(i.status === "queued" || i.status === "failed") && !(i.status === "applied" && !i.reviewed));

    return (
        <Screen edges={["top", "bottom"]}>
            <Header title="Sync"/>
            <ScrollView contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 32}}
                        showsVerticalScrollIndicator={false}>
                <Card className="gap-3 p-4">
                    <View className="flex-row items-center gap-3">
                        <View
                            className={`h-12 w-12 items-center justify-center rounded-xl ${online ? "bg-emerald-100 dark:bg-emerald-500/20" : "bg-amber-100 dark:bg-amber-500/20"}`}>
                            {online ? <Cloud size={22} color="#047857"/> : <CloudOff size={22} color="#b45309"/>}
                        </View>
                        <View className="flex-1">
                            <Text
                                className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{online ? "You're online" : "You're offline"}</Text>
                            <Text
                                className="text-sm text-zinc-500 dark:text-zinc-400">{online ? `Last synced ${timeAgo(lastSyncedAt)}` : "Changes stay on this phone until you reconnect."}</Text>
                        </View>
                    </View>
                    <Button
                        label={syncing ? "Syncing…" : pending > 0 ? `Upload ${pending} change${pending === 1 ? "" : "s"}` : "Sync now"}
                        icon={RefreshCw} loading={syncing} disabled={!online} onPress={syncNow}/>
                </Card>

                <Group title="On this phone" icon={CircleCheck} items={onDevice} empty="Nothing waiting to upload"
                       onRetry={syncNow}/>

                <SectionHeader title="Waiting for review"/>
                <Card className="gap-3 p-4">
                    {can.write(role) &&
                        <Button
                            label="See what's under review"
                            variant="secondary"
                            onPress={() => router.push("/review")} className="h-12"
                        />
                    }
                    <View className="flex-row items-start gap-3">
                        <GitPullRequest size={20} color={c.brand} style={{marginTop: 2}}/>
                        <Text className="flex-1 text-base text-zinc-700 dark:text-zinc-300">
                            {awaitingReview > 0
                                ? `${awaitingReview} of your changes reached the server. An engineer reviews them before they appear on the live network for everyone.`
                                : "Everything you've sent has been reviewed."}
                        </Text>
                    </View>
                    {waiting(waitingReview)}
                </Card>

                <Group title="Recently sent" icon={CircleCheck} items={done} empty="Nothing sent yet"/>

                <View className="mt-6 flex-row items-start gap-2 px-1">
                    <TriangleAlert size={16} color={c.faint} style={{marginTop: 2}}/>
                    <Text className="flex-1 text-sm text-zinc-400">Your edits are grouped into one set of changes per
                        day. If something goes wrong sending, nothing is lost — it stays here until it goes
                        through.</Text>
                </View>
            </ScrollView>
        </Screen>
    );
}

function waiting(items: SyncItem[]) {
    if (items.length === 0) return null;
    return (
        <View className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {items.map((i, idx) => (
                <View key={i.id}>
                    {idx > 0 && <Divider/>}
                    <View className="flex-row items-center justify-between gap-3 px-3 py-2.5">
                        <Text numberOfLines={1}
                              className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">{i.title} · {i.assetName}</Text>
                        <Text className="text-xs text-zinc-400">{timeAgo(i.at)}</Text>
                    </View>
                </View>
            ))}
        </View>
    );
}
