import { Alert, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CircleDot, ClipboardCheck, CloudUpload, Navigation, SearchX, Trash2 } from "lucide-react-native";
import { TypeTile } from "../../../components/asset-row";
import { Button, Card, ConditionBadge, Divider, EmptyState, Header, Screen, SectionHeader, StatusPill } from "../../../components/ui";
import { useApp } from "../../../lib/app-state";
import { NODE_TYPE_LABEL, formatCoords, formatDate, inspectionState, timeAgo, titleCase } from "../../../lib/assets";
import { can } from "../../../lib/permissions";
import { CONDITION_LABEL } from "../../../lib/theme";
import { CONDITION_HEX } from "@majimap/shared-types";
import { describeJunction } from "../../../lib/asset-rules";
import { Image } from "react-native";
import { FileText } from "lucide-react-native";
import { openDirections } from "../../../lib/directions";

export default function AssetDetail() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { nodes, structures, inspections, valveLogs, queue, role, showToast } = useApp();
    const node = nodes.find((n) => n.id === id);

    if (!node) {
        return (
            <Screen edges={["top", "bottom"]}>
                <Header title="Asset" />
                <EmptyState icon={SearchX} title="Asset not found" body="It may have been deleted or isn't part of the network you can see." />
            </Screen>
        );
    }

    const housedIn = structures.find((s) => s.id === node.structureId);
    const waiting = queue.filter((q) => q.assetId === node.id && (q.status === "queued" || q.status === "failed")).length;
    const insp = inspectionState(node.lastInspectedAt);
    const isValve = node.type === "valve";

    // One timeline of inspections and valve operations, newest first.
    const history = [
        ...inspections.filter((i) => i.assetId === node.id).map((i) => ({ id: i.id, at: i.recordedAt, by: i.recordedByName, note: i.note, kind: "condition" as const, condition: i.condition, isOpen: null as boolean | null })),
        ...valveLogs.filter((v) => v.valveId === node.id).map((v) => ({ id: v.id, at: v.changedAt, by: v.changedByName, note: v.note, kind: "valve" as const, condition: null, isOpen: v.isOpen as boolean | null })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    const Detail = ({ label, value }: { label: string; value: string }) => (
        <View className="min-h-14 flex-row items-center justify-between gap-4 px-4 py-3">
            <Text className="text-base text-zinc-500 dark:text-zinc-400">{label}</Text>
            <Text numberOfLines={1} className="flex-1 text-right text-base font-medium text-zinc-900 dark:text-zinc-50">{value}</Text>
        </View>
    );

    return (
        <Screen edges={["top", "bottom"]}>
            <Header title={node.name} subtitle={NODE_TYPE_LABEL[node.type]} />
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                <Card className="gap-4 p-4">
                    <View className="flex-row items-center gap-3">
                        <TypeTile type={node.type} size={56} />
                        <View className="flex-1 gap-1.5">
                            <ConditionBadge condition={node.condition} />
                            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                                {insp === "never" ? "Never inspected" : `Inspected ${timeAgo(node.lastInspectedAt)}`}
                            </Text>
                        </View>
                        {insp !== "ok" && <StatusPill tone="warn" label={insp === "never" ? "Inspect" : "Overdue"} />}
                    </View>

                    {isValve && (
                        <View className="flex-row items-center justify-between rounded-xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
                            <Text className="text-base text-zinc-600 dark:text-zinc-300">Valve is</Text>
                            <Text className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{node.isOpen === true ? "Open" : node.isOpen === false ? "Closed" : "Unknown"}</Text>
                        </View>
                    )}

                    {waiting > 0 && <StatusPill tone="info" icon={CloudUpload} label={`${waiting} change${waiting === 1 ? "" : "s"} waiting to upload`} />}
                </Card>

                <View className="mt-4 gap-3">
                    {can.write(role) && (
                        <View className="flex-row gap-3">
                            <Button label="Record inspection" icon={ClipboardCheck} onPress={() => router.push(`/inspect/${node.id}`)} className="flex-1" />
                            {isValve && <Button label="Operate" variant="secondary" icon={CircleDot} onPress={() => router.push(`/valve/${node.id}`)} className="px-4" />}
                        </View>
                    )}
                    <Button label="Directions" variant="secondary" icon={Navigation} onPress={() => openDirections(node.location, node.name)} />
                </View>

                <SectionHeader title="Details" />
                <Card className="overflow-hidden">
                    <Detail label="Installed" value={formatDate(node.installedAt)} />
                    <Divider />
                    <Detail label="Housed in" value={housedIn ? `${housedIn.name} (${titleCase(housedIn.type)})` : "Not in a structure"} />
                    <Divider />
                    {node.junction && (
                        <>
                            <Detail label="Junction" value={describeJunction(node.junction)} />
                            <Divider />
                        </>
                    )}
                    <Detail label="Location" value={formatCoords(node.location)} />
                    <Divider />
                    <Detail label="Asset ID" value={node.id} />
                </Card>

                {(node.attachments?.length ?? 0) > 0 && (
                    <>
                        <SectionHeader title="Photos and files" />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                            {node.attachments!.filter((a) => a.kind === "photo").map((a) => (
                                <Image key={a.id} source={{ uri: a.uri }} style={{ width: 120, height: 120, borderRadius: 16 }} accessibilityLabel={a.name} />
                            ))}
                        </ScrollView>
                        {node.attachments!.filter((a) => a.kind === "document").map((a) => (
                            <Card key={a.id} className="mt-2 min-h-14 flex-row items-center gap-3 px-4">
                                <FileText size={20} color="#71717a" />
                                <Text numberOfLines={1} className="flex-1 text-base text-zinc-900 dark:text-zinc-50">{a.name}</Text>
                            </Card>
                        ))}
                    </>
                )}

                <SectionHeader title="History" />
                <Card className="overflow-hidden">
                    {history.length === 0 ? (
                        <Text className="p-4 text-base text-zinc-500 dark:text-zinc-400">No inspections recorded yet.</Text>
                    ) : (
                        history.map((h, i) => (
                            <View key={h.id}>
                                {i > 0 && <Divider />}
                                <View className="gap-1 px-4 py-3.5">
                                    <View className="flex-row items-center justify-between gap-3">
                                        <View className="flex-row items-center gap-2">
                                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: h.condition ? CONDITION_HEX[h.condition] : "#71717a" }} />
                                            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                                                {h.kind === "condition" ? `Inspected · ${CONDITION_LABEL[h.condition!]}` : `Valve ${h.isOpen ? "opened" : "closed"}`}
                                            </Text>
                                        </View>
                                        <Text className="text-sm text-zinc-400">{timeAgo(h.at)}</Text>
                                    </View>
                                    {h.note ? <Text className="text-sm text-zinc-600 dark:text-zinc-400">{h.note}</Text> : null}
                                    <Text className="text-sm text-zinc-400">{h.by}</Text>
                                </View>
                            </View>
                        ))
                    )}
                </Card>

                {can.delete(role) && (
                    <View className="mt-6">
                        <Button
                            label="Delete asset"
                            variant="ghost"
                            icon={Trash2}
                            onPress={() =>
                                Alert.alert("Delete this asset?", "It will be removed from your changes and, once reviewed, from the live network.", [
                                    { text: "Cancel", style: "cancel" },
                                    { text: "Delete", style: "destructive", onPress: () => { showToast("Delete is a mock for now"); } },
                                ])
                            }
                        />
                    </View>
                )}
            </ScrollView>
        </Screen>
    );
}
