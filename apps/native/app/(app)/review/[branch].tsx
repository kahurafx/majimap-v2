import { useState } from "react";
import { Alert, LayoutAnimation, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowRight, Box, ChevronDown, CircleCheck, Hexagon, MapPin, Route as RouteIcon, SearchX, Trash2, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { Button, Card, Divider, EmptyState, Footer, Header, Screen, SectionHeader, StatusPill } from "../../../components/ui";
import { useApp } from "../../../lib/app-state";
import { can } from "../../../lib/permissions";
import {
    EXISTENCE_FIELD, MODE_LABEL, SKIP_LABEL, conflictsOf, fieldLabel, formatRange, formatValue, initialsOf,
    type EntityType, type FieldConflict, type PostResult, type Resolutions, type ReviewEntity,
} from "../../../lib/review";
import { useColors } from "../../../lib/theme";

const ENTITY_ICON: Record<EntityType, LucideIcon> = { node: MapPin, structure: Box, pipe: RouteIcon, dma: Hexagon };

function Option({ selected, title, value, hint, onPress }: { selected: boolean; title: string; value: string; hint?: string; onPress: () => void }) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            className={`flex-row items-center gap-3 rounded-2xl border-2 p-3.5 ${selected ? "border-brand-600 bg-brand-50 dark:bg-brand-600/15" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"}`}
        >
            <View className={`h-6 w-6 items-center justify-center rounded-full border-2 ${selected ? "border-brand-600" : "border-zinc-300 dark:border-zinc-600"}`}>
                {selected && <View className="h-3 w-3 rounded-full bg-brand-600" />}
            </View>
            <View className="flex-1">
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">{title}</Text>
                <Text className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value}</Text>
                {hint ? <Text className="text-sm text-zinc-500 dark:text-zinc-400">{hint}</Text> : null}
            </View>
        </Pressable>
    );
}

function ConflictCard({ entity, resolutions, onPick }: { entity: ReviewEntity; resolutions: Resolutions; onPick: (field: string, side: "branch" | "main") => void }) {
    const Icon = ENTITY_ICON[entity.entityType];
    const c = useColors();
    const describe = (cf: FieldConflict) => {
        if (cf.field === EXISTENCE_FIELD) {
            const deleted = cf.branch === "deleted";
            return {
                title: "Whether it exists",
                branchValue: deleted ? "Delete it" : "Restore it",
                branchHint: deleted ? "The technician removed it." : "The technician edited it.",
                mainValue: deleted ? "Keep it" : "Keep it deleted",
                mainHint: deleted ? "It was edited on the live network since." : "It was deleted on the live network since.",
                base: undefined as string | undefined,
            };
        }
        return {
            title: fieldLabel(cf.field),
            branchValue: formatValue(cf.field, cf.branch),
            branchHint: undefined,
            mainValue: formatValue(cf.field, cf.main),
            mainHint: undefined,
            base: `Originally ${formatValue(cf.field, cf.base)}`,
        };
    };
    return (
        <Card className="gap-4 p-4">
            <View className="flex-row items-center gap-3">
                <Icon size={20} color={c.brand} />
                <Text numberOfLines={1} className="flex-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">{entity.name}</Text>
            </View>
            {conflictsOf(entity).map((cf) => {
                const d = describe(cf);
                const picked = resolutions[entity.id]?.[cf.field];
                return (
                    <View key={cf.field} className="gap-2">
                        <Text className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{d.title}{d.base ? ` · ${d.base}` : ""}</Text>
                        <Option selected={picked === "branch"} title="Technician's change" value={d.branchValue} hint={d.branchHint} onPress={() => onPick(cf.field, "branch")} />
                        <Option selected={picked === "main"} title="Live network now" value={d.mainValue} hint={d.mainHint} onPress={() => onPick(cf.field, "main")} />
                    </View>
                );
            })}
        </Card>
    );
}

function ChangeRow({ entity }: { entity: ReviewEntity }) {
    const c = useColors();
    const [open, setOpen] = useState(false);
    const Icon = ENTITY_ICON[entity.entityType];
    if (entity.plan.kind !== "write") return null;
    const { mode, changes } = entity.plan;
    const expandable = changes.length > 0;
    return (
        <View>
            <Pressable
                onPress={() => { if (!expandable) return; LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpen((o) => !o); }}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                className="min-h-[68px] flex-row items-center gap-3 px-4 py-3 active:bg-zinc-100 dark:active:bg-zinc-800/60"
            >
                <Icon size={20} color={c.muted} />
                <View className="flex-1">
                    <Text numberOfLines={1} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{entity.name}</Text>
                    <Text className="text-sm text-zinc-500 dark:text-zinc-400">{MODE_LABEL[mode]}{expandable ? ` · ${changes.length} field${changes.length === 1 ? "" : "s"}` : ""}</Text>
                </View>
                {mode === "delete" && <StatusPill label="Removes" tone="danger" />}
                {expandable && <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}><ChevronDown size={20} color={c.faint} /></View>}
            </Pressable>
            {open && (
                <View className="gap-2.5 px-4 pb-4">
                    {changes.map((ch) => (
                        <View key={ch.field} className="gap-0.5">
                            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{fieldLabel(ch.field)}</Text>
                            <View className="flex-row flex-wrap items-center gap-2">
                                {mode !== "create" && (
                                    <>
                                        <Text className="text-base text-zinc-400">{formatValue(ch.field, ch.from)}</Text>
                                        <ArrowRight size={16} color={c.faint} />
                                    </>
                                )}
                                <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{formatValue(ch.field, ch.to)}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

export default function ReviewBranchScreen() {
    const { branch: name } = useLocalSearchParams<{ branch: string }>();
    const router = useRouter();
    const c = useColors();
    const { branches, role, postBranch, discardBranch } = useApp();

    // Posting removes the branch from the list, so keep what we're looking at.
    const [snapshot] = useState(() => branches.find((b) => b.branch === name));
    const [resolutions, setResolutions] = useState<Resolutions>({});
    const [posting, setPosting] = useState(false);
    const [result, setResult] = useState<PostResult | null>(null);

    if (!snapshot) {
        return (
            <Screen edges={["top", "bottom"]}>
                <Header title="Review changes" />
                <EmptyState icon={SearchX} title="Not found" body="This set of changes was already posted or discarded." />
            </Screen>
        );
    }

    const reviewer = can.review(role);
    const conflicts = snapshot.entities.filter((e) => e.plan.kind === "conflict");
    const writes = snapshot.entities.filter((e) => e.plan.kind === "write");
    const skips = snapshot.entities.filter((e) => e.plan.kind === "skip");

    const totalFields = conflicts.reduce((n, e) => n + conflictsOf(e).length, 0);
    const decided = conflicts.reduce((n, e) => n + conflictsOf(e).filter((cf) => resolutions[e.id]?.[cf.field]).length, 0);
    const undecided = totalFields - decided;
    const willPost = writes.length + conflicts.filter((e) => conflictsOf(e).every((cf) => resolutions[e.id]?.[cf.field])).length;

    const pick = (entityId: string) => (field: string, side: "branch" | "main") =>
        setResolutions((r) => ({ ...r, [entityId]: { ...r[entityId], [field]: side } }));

    async function doPost() {
        setPosting(true);
        const res = await postBranch(snapshot!.branch, resolutions);
        setPosting(false);
        setResult(res);
    }
    function confirmPost() {
        Alert.alert(
            `Post ${willPost} change${willPost === 1 ? "" : "s"} to the live network?`,
            "Everyone sees them straight away. If anything fails, nothing is posted.",
            [{ text: "Cancel", style: "cancel" }, { text: "Post", onPress: doPost }],
        );
    }
    function confirmDiscard() {
        Alert.alert("Discard these changes?", "The technician's edits stop being proposals. The live network isn't touched.", [
            { text: "Cancel", style: "cancel" },
            { text: "Discard", style: "destructive", onPress: async () => { await discardBranch(snapshot!.branch); router.back(); } },
        ]);
    }

    /* ---------- outcome views ---------- */

    if (result?.status === "posted") {
        const s = result.summary;
        const lines: [string, number][] = [["Added", s.created], ["Updated", s.fastForwarded + s.merged], ["Deleted", s.deleted], ["Restored", s.restored], ["Left as they were", s.skipped]];
        return (
            <Screen edges={["top", "bottom"]}>
                <Header title="Posted" />
                <View className="flex-1 items-center justify-center gap-4 px-6">
                    <View className="h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
                        <CircleCheck size={40} color="#047857" />
                    </View>
                    <Text className="text-center text-xl font-bold text-zinc-900 dark:text-zinc-50">Posted to the live network</Text>
                    <Card className="w-full overflow-hidden">
                        {lines.filter(([, n]) => n > 0).map(([label, n], i) => (
                            <View key={label}>
                                {i > 0 && <Divider />}
                                <View className="min-h-12 flex-row items-center justify-between px-4"><Text className="text-base text-zinc-700 dark:text-zinc-300">{label}</Text><Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{n}</Text></View>
                            </View>
                        ))}
                    </Card>
                </View>
                <Footer><Button label="Back to review" onPress={() => router.back()} /></Footer>
            </Screen>
        );
    }

    if (result?.status === "invalid") {
        return (
            <Screen edges={["top", "bottom"]}>
                <Header title="Couldn't post" />
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}>
                    <View className="gap-2 rounded-2xl bg-red-100 p-4 dark:bg-red-500/15">
                        <View className="flex-row items-center gap-2">
                            <TriangleAlert size={20} color="#b91c1c" />
                            <Text className="text-base font-semibold text-red-900 dark:text-red-200">Nothing was changed</Text>
                        </View>
                        <Text className="text-sm text-red-900 dark:text-red-200">Posting these would leave the live network inconsistent:</Text>
                    </View>
                    <Card className="overflow-hidden">
                        {result.violations.map((v, i) => (
                            <View key={`${v.entityId}-${i}`}>
                                {i > 0 && <Divider />}
                                <Text className="p-4 text-base text-zinc-800 dark:text-zinc-200">{v.message}</Text>
                            </View>
                        ))}
                    </Card>
                    <Text className="px-1 text-sm text-zinc-500 dark:text-zinc-400">Ask {snapshot.authorName} to fix it, or discard this set of changes.</Text>
                </ScrollView>
                <Footer>
                    <Button label="Back to the changes" onPress={() => setResult(null)} />
                    {reviewer && <Button label="Discard these changes" variant="ghost" icon={Trash2} onPress={confirmDiscard} />}
                </Footer>
            </Screen>
        );
    }

    /* ---------- main view ---------- */

    return (
        <Screen edges={["top", "bottom"]}>
            <Header title={snapshot.authorName} subtitle={formatRange(snapshot.firstEditAt, snapshot.lastEditAt)} />
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                <View className="flex-row flex-wrap gap-2 px-1">
                    <StatusPill label={`${willPost} ready`} tone="ok" />
                    {undecided > 0 && <StatusPill label={`${undecided} to decide`} tone="warn" />}
                    {skips.length > 0 && <StatusPill label={`${skips.length} unchanged`} tone="neutral" />}
                </View>

                {conflicts.length > 0 && (
                    <>
                        <SectionHeader title="Needs your decision" />
                        <Text className="-mt-1 mb-3 px-1 text-sm text-zinc-500 dark:text-zinc-400">The live network changed after the technician started. Choose which version to keep.</Text>
                        <View className="gap-3">
                            {conflicts.map((e) => <ConflictCard key={e.id} entity={e} resolutions={resolutions} onPick={reviewer ? pick(e.id) : () => {}} />)}
                        </View>
                    </>
                )}

                {writes.length > 0 && (
                    <>
                        <SectionHeader title="Changes" />
                        <Card className="overflow-hidden">
                            {writes.map((e, i) => (
                                <View key={e.id}>
                                    {i > 0 && <Divider />}
                                    <ChangeRow entity={e} />
                                </View>
                            ))}
                        </Card>
                    </>
                )}

                {skips.length > 0 && (
                    <>
                        <SectionHeader title="No change needed" />
                        <Card className="overflow-hidden">
                            {skips.map((e, i) => (
                                <View key={e.id}>
                                    {i > 0 && <Divider />}
                                    <View className="min-h-14 flex-row items-center justify-between gap-3 px-4 py-3">
                                        <Text numberOfLines={1} className="flex-1 text-base text-zinc-700 dark:text-zinc-300">{e.name}</Text>
                                        <Text className="text-sm text-zinc-400">{e.plan.kind === "skip" ? SKIP_LABEL[e.plan.reason] : ""}</Text>
                                    </View>
                                </View>
                            ))}
                        </Card>
                    </>
                )}
            </ScrollView>

            {reviewer ? (
                <Footer>
                    <Button label={`Post ${willPost} change${willPost === 1 ? "" : "s"}`} loading={posting} disabled={undecided > 0} onPress={confirmPost} />
                    <Text className={`text-center text-sm ${undecided > 0 ? "text-amber-800 dark:text-amber-300" : "text-zinc-400"}`}>
                        {undecided > 0 ? `Decide ${undecided} conflict${undecided === 1 ? "" : "s"} first` : "All or nothing: if anything fails, nothing is posted."}
                    </Text>
                    <Button label="Discard these changes" variant="ghost" icon={Trash2} onPress={confirmDiscard} className="h-12" />
                </Footer>
            ) : (
                <Footer>
                    <Text className="pb-1 text-center text-sm text-zinc-500 dark:text-zinc-400">An engineer will review these. You'll see them on the map once approved.</Text>
                </Footer>
            )}
        </Screen>
    );
}