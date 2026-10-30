import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, CircleCheck } from "lucide-react-native";
import { Card, EmptyState, Header, Screen, StatusPill } from "../../../components/ui";
import { useApp } from "../../../lib/app-state";
import { can } from "../../../lib/permissions";
import { formatRange, initialsOf, summarize } from "../../../lib/review";
import { useColors } from "../../../lib/theme";

export default function ReviewList() {
    const router = useRouter();
    const c = useColors();
    const { branches, role } = useApp();
    const reviewer = can.review(role);

    return (
        <Screen edges={["top", "bottom"]}>
            <Header title={reviewer ? "Review changes" : "Changes under review"} />
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 12 }} showsVerticalScrollIndicator={false}>
                <Text className="px-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {reviewer
                        ? "Field edits stay separate from the live network until you approve them. Each set is posted all together or not at all."
                        : "These are field edits waiting for an engineer. They go live once approved."}
                </Text>

                {branches.length === 0 ? (
                    <EmptyState icon={CircleCheck} title="Nothing to review" body="New sets of changes appear here once technicians upload them." />
                ) : (
                    branches.map((b) => {
                        const s = summarize(b);
                        return (
                            <Pressable key={b.branch} onPress={() => router.push({ pathname: "/review/[branch]", params: { branch: b.branch } })} accessibilityRole="button">
                                <Card className="gap-3 p-4 active:bg-zinc-100 dark:active:bg-zinc-800">
                                    <View className="flex-row items-center gap-3">
                                        <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-600">
                                            <Text className="text-base font-bold text-white">{initialsOf(b.authorName)}</Text>
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{b.authorName}</Text>
                                            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{formatRange(b.firstEditAt, b.lastEditAt)}</Text>
                                        </View>
                                        <ChevronRight size={18} color={c.faint} />
                                    </View>
                                    <View className="flex-row flex-wrap items-center gap-2">
                                        <Text className="text-sm text-zinc-600 dark:text-zinc-400">{s.total} change{s.total === 1 ? "" : "s"}</Text>
                                        {s.conflicts > 0 ? <StatusPill label={`${s.conflicts} need${s.conflicts === 1 ? "s" : ""} a decision`} tone="warn" /> : <StatusPill label="Ready to post" tone="ok" />}
                                    </View>
                                </Card>
                            </Pressable>
                        );
                    })
                )}
            </ScrollView>
        </Screen>
    );
}