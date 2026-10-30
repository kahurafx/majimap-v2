import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LocateFixed, MapPin } from "lucide-react-native";
import { CONDITION_HEX, STRUCTURE_ATTACHMENT_RULES, type Condition, type NodeType, type StructureType } from "@majimap/shared-types";
import { Button, Card, Chip, Field, Footer, Header, Screen, Segmented } from "../../components/ui";
import { useApp } from "../../lib/app-state";
import {
    JUNCTION_TYPES, JUNCTION_TYPE_HINT, JUNCTION_TYPE_LABEL, NODE_PHOTO_RULE, PIPE_SIZES_MM, STRUCTURE_PHOTO_RULE,
    describeJunction, outletLabel, type JunctionType,
} from "../../lib/asset-rules";
import { NODE_TYPE_LABEL, NODE_TYPES, STRUCTURE_TYPES, approxMetres, formatCoords, titleCase } from "../../lib/assets";
import { CONDITION_LABEL, useColors } from "../../lib/theme";
import { AttachmentPicker } from "../../components/attachment-picker";
import type { Attachment } from "../../lib/attachments";
import { useLocation } from "../../lib/location";

type Kind = "node" | "pipe" | "structure";
const CONDITIONS: Condition[] = ["good", "fair", "poor", "critical", "unknown"];
const MATERIALS = ["pvc", "ductile_iron", "hdpe", "steel", "concrete", "unknown"] as const;
const num = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 0);

const Label = ({ children }: { children: string }) => <Text className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{children}</Text>;

/** A numeric field with common sizes underneath for one-tap entry. */
function SizeField({ label, value, onChange, below }: { label: string; value: string; onChange: (v: string) => void; below?: number }) {
    const sizes = below ? PIPE_SIZES_MM.filter((s) => s < below) : PIPE_SIZES_MM;
    return (
        <View className="gap-2">
            <Field label={label} value={value} onChangeText={onChange} keyboardType="numeric" placeholder="e.g. 200" />
            <View className="flex-row flex-wrap gap-2">
                {sizes.map((s) => (
                    <Chip key={s} label={`${s}`} active={num(value) === s} onPress={() => onChange(String(s))} />
                ))}
            </View>
        </View>
    );
}

/**
 * One form for the three things a person can add. The server rules shown here
 * are the same ones it enforces: only valves have an open/closed state, only
 * some node types can be housed in some structure types, a pipe needs two
 * different existing nodes and its length comes from its path.
 * New this round: photos (required or optional by type, see lib/asset-rules)
 * and junction type and sizes.
 */
export default function AddAsset() {
    const params = useLocalSearchParams<{ kind?: Kind }>();
    const router = useRouter();
    const c = useColors();
    const { nodes, structures, addNode, queueCreate } = useApp();

    const [kind, setKind] = useState<Kind>(params.kind ?? "node");
    const [nodeType, setNodeType] = useState<NodeType>("valve");
    const [structureType, setStructureType] = useState<StructureType>("manhole");
    const [name, setName] = useState("");
    const [condition, setCondition] = useState<Condition>("unknown");
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const photoCount = attachments.filter((a) => a.kind === "photo").length;
    const [fixing, setFixing] = useState(false);
    const [accuracyM, setAccuracyM] = useState<number | null>(null);
    const { status: gpsStatus, request: requestGps, refresh: refreshGps } = useLocation();
    const [isOpen, setIsOpen] = useState<"open" | "closed" | "unknown">("unknown");
    const [structureId, setStructureId] = useState<string | null>(null);

    const [jType, setJType] = useState<JunctionType>("tee");
    const [mainSize, setMainSize] = useState("");
    const [reduced, setReduced] = useState(false);
    const [branchSize, setBranchSize] = useState("");

    const [fromId, setFromId] = useState<string | null>(null);
    const [toId, setToId] = useState<string | null>(null);
    const [material, setMaterial] = useState<(typeof MATERIALS)[number]>("unknown");
    const [diameter, setDiameter] = useState("");

    const allowedStructures = useMemo(() => {
        const types = STRUCTURE_ATTACHMENT_RULES[nodeType];
        return structures.filter((s) => types.includes(s.type));
    }, [nodeType, structures]);

    const from = nodes.find((n) => n.id === fromId);
    const to = nodes.find((n) => n.id === toId);
    const pipeLength = from && to ? Math.round(approxMetres(from.location, to.location)) : null;
    const sameEnds = !!fromId && fromId === toId;

    const isJunction = kind === "node" && nodeType === "junction";
    // A reducer always steps down, so "equal" doesn't apply to it.
    const isReduced = jType === "reducer" || reduced;
    const main = num(mainSize);
    const branch = num(branchSize);
    const photoRule = kind === "node" ? NODE_PHOTO_RULE[nodeType] : kind === "structure" ? STRUCTURE_PHOTO_RULE : null;

    async function useMyLocation() {
        setFixing(true);
        if (gpsStatus !== "granted" && !(await requestGps())) {
            setFixing(false);
            return;
        }
        const fix = await refreshGps();
        setFixing(false);
        if (fix) {
            setLocation(fix.point);
            setAccuracyM(fix.accuracyM);
        }
    }

    /** The first thing stopping a save, in plain words. Null means ready. */
    const issue: string | null = (() => {
        if (kind === "pipe") {
            if (!fromId || !toId) return "Choose both end nodes";
            if (sameEnds) return "Choose two different end nodes";
            if (!(num(diameter) > 0)) return "Enter the pipe diameter";
            return null;
        }
        if (!name.trim()) return "Enter a name";
        if (!location) return "Add the location";
        if (isJunction) {
            if (!(main > 0)) return "Enter the junction's pipe size";
            if (isReduced && !(branch > 0)) return `Enter the ${outletLabel(jType).toLowerCase()}`;
            if (isReduced && branch >= main) return "The smaller size must be less than the main size";
        }
        if (photoRule === "required" && photoCount === 0) return "Add at least one photo";
        return null;
    })();

    function save() {
        if (issue) return;
        if (kind === "node") {
            addNode({
                type: nodeType,
                name: name.trim(),
                location: location!,
                condition,
                isOpen: nodeType === "valve" ? (isOpen === "unknown" ? null : isOpen === "open") : null,
                structureId: allowedStructures.some((s) => s.id === structureId) ? structureId : null,
                installedAt: null,
                lastInspectedAt: null,
                junction: isJunction ? { type: jType, mainSizeMm: main, branchSizeMm: isReduced ? branch : null } : null,
                attachments,
            });
        } else if (kind === "structure") {
            queueCreate(`New ${structureType}`, name.trim(), `${photoCount} photo${photoCount === 1 ? "" : "s"}`);
        } else {
            queueCreate("New pipe", `${from!.name} to ${to!.name}`, `${Math.round(num(diameter))} mm · ${pipeLength} m`);
        }
        router.back();
    }

    return (
        <Screen edges={["top", "bottom"]}>
            <Header title="Add asset" />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
                    <Segmented<Kind>
                        value={kind}
                        onChange={(k) => { setKind(k); setAttachments([]); }}
                        options={[{ value: "node", label: "Node" }, { value: "pipe", label: "Pipe" }, { value: "structure", label: "Structure" }]}
                    />

                    {kind !== "pipe" && (
                        <>
                            <View className="gap-2">
                                <Label>Type</Label>
                                <View className="flex-row flex-wrap gap-2">
                                    {kind === "node"
                                        ? NODE_TYPES.map((t) => <Chip key={t} label={NODE_TYPE_LABEL[t]} active={nodeType === t} onPress={() => { setNodeType(t); setStructureId(null); }} />)
                                        : STRUCTURE_TYPES.map((t) => <Chip key={t} label={titleCase(t)} active={structureType === t} onPress={() => setStructureType(t)} />)}
                                </View>
                            </View>

                            <Field label="Name" value={name} onChangeText={setName} placeholder={kind === "node" ? "e.g. Valve KLS-04" : "e.g. Manhole MH-13"} maxLength={200} />

                            {isJunction && (
                                <View className="gap-4">
                                    <View className="gap-2">
                                        <Label>Junction type</Label>
                                        <View className="flex-row flex-wrap gap-2">
                                            {JUNCTION_TYPES.map((t) => <Chip key={t} label={JUNCTION_TYPE_LABEL[t]} active={jType === t} onPress={() => setJType(t)} />)}
                                        </View>
                                        <Text className="text-sm text-zinc-500 dark:text-zinc-400">{JUNCTION_TYPE_HINT[jType]}</Text>
                                    </View>

                                    <SizeField label="Pipe size (mm)" value={mainSize} onChange={setMainSize} />

                                    {jType === "reducer" ? (
                                        <Text className="text-sm text-zinc-500 dark:text-zinc-400">A reducer always steps down to a smaller size.</Text>
                                    ) : (
                                        <View className="gap-2">
                                            <Label>Sizes</Label>
                                            <Segmented value={reduced ? "reduced" : "equal"} onChange={(v) => setReduced(v === "reduced")} options={[{ value: "equal", label: "Equal" }, { value: "reduced", label: "Reduced" }]} />
                                        </View>
                                    )}

                                    {isReduced && <SizeField label={outletLabel(jType)} value={branchSize} onChange={setBranchSize} below={main > 0 ? main : undefined} />}

                                    {main > 0 && (!isReduced || (branch > 0 && branch < main)) && (
                                        <Card className="px-4 py-3">
                                            <Text className="text-base font-medium text-zinc-900 dark:text-zinc-50">
                                                {describeJunction({ type: jType, mainSizeMm: main, branchSizeMm: isReduced ? branch : null })}
                                            </Text>
                                        </Card>
                                    )}
                                </View>
                            )}

                            <View className="gap-2">
                                <Label>Location</Label>
                                <Card className="gap-3 p-3.5">
                                    {location ? (
                                        <View className="flex-row items-center gap-2">
                                            <MapPin size={18} color={c.brand} />
                                            <Text className="flex-1 text-base font-medium text-zinc-900 dark:text-zinc-50">{formatCoords(location)}</Text>
                                        </View>
                                    ) : (
                                        <Text className="text-base text-zinc-500 dark:text-zinc-400">No location yet. Stand at the asset and use your GPS position.</Text>
                                    )}
                                    <Button label={fixing ? "Finding you…" : location ? "Update from GPS" : "Use my location"} variant="secondary" icon={LocateFixed} loading={fixing} onPress={useMyLocation} className="h-12" />
                                    {accuracyM !== null && (
                                        <Text className={`text-sm ${accuracyM > 30 ? "text-amber-800 dark:text-amber-300" : "text-zinc-400"}`}>
                                            Accurate to about {Math.round(accuracyM)} m{accuracyM > 30 ? ". Weak signal: move into the open and try again." : "."}
                                        </Text>
                                    )}
                                </Card>
                            </View>

                            {photoRule && <AttachmentPicker items={attachments} onChange={setAttachments} photoRule={photoRule} />}

                            <View className="gap-2">
                                <Label>Condition</Label>
                                <View className="flex-row flex-wrap gap-2">
                                    {CONDITIONS.map((o) => <Chip key={o} label={CONDITION_LABEL[o]} dot={CONDITION_HEX[o]} active={condition === o} onPress={() => setCondition(o)} />)}
                                </View>
                            </View>

                            {kind === "node" && nodeType === "valve" && (
                                <View className="gap-2">
                                    <Label>Valve state</Label>
                                    <Segmented value={isOpen} onChange={setIsOpen} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "unknown", label: "Unknown" }]} />
                                </View>
                            )}

                            {kind === "node" && (
                                <View className="gap-2">
                                    <Label>Housed in</Label>
                                    {STRUCTURE_ATTACHMENT_RULES[nodeType].length === 0 ? (
                                        <Text className="text-sm text-zinc-500 dark:text-zinc-400">A {NODE_TYPE_LABEL[nodeType].toLowerCase()} isn't housed in a structure.</Text>
                                    ) : (
                                        <View className="flex-row flex-wrap gap-2">
                                            <Chip label="None" active={structureId === null} onPress={() => setStructureId(null)} />
                                            {allowedStructures.map((s) => <Chip key={s.id} label={s.name} active={structureId === s.id} onPress={() => setStructureId(s.id)} />)}
                                        </View>
                                    )}
                                </View>
                            )}
                        </>
                    )}

                    {kind === "pipe" && (
                        <>
                            <View className="gap-2">
                                <Label>From node</Label>
                                <View className="flex-row flex-wrap gap-2">{nodes.map((n) => <Chip key={n.id} label={n.name} active={fromId === n.id} onPress={() => setFromId(n.id)} />)}</View>
                            </View>
                            <View className="gap-2">
                                <Label>To node</Label>
                                <View className="flex-row flex-wrap gap-2">{nodes.map((n) => <Chip key={n.id} label={n.name} active={toId === n.id} onPress={() => setToId(n.id)} />)}</View>
                                {sameEnds && <Text className="text-sm text-red-700 dark:text-red-400">A pipe needs two different end nodes.</Text>}
                            </View>
                            <View className="gap-2">
                                <Label>Material</Label>
                                <View className="flex-row flex-wrap gap-2">{MATERIALS.map((m) => <Chip key={m} label={m === "pvc" || m === "hdpe" ? m.toUpperCase() : titleCase(m)} active={material === m} onPress={() => setMaterial(m)} />)}</View>
                            </View>
                            <SizeField label="Diameter (mm)" value={diameter} onChange={setDiameter} />
                            <Card className="p-3.5">
                                <Text className="text-base text-zinc-700 dark:text-zinc-300">
                                    {pipeLength !== null && !sameEnds ? `Length ${pipeLength} m, calculated from its path.` : "Length is calculated from the pipe's path once both ends are chosen."}
                                </Text>
                            </Card>
                        </>
                    )}
                </ScrollView>

                <Footer>
                    <Button label="Save to my changes" disabled={!!issue} onPress={save} />
                    <Text className={`pb-1 text-center text-sm ${issue ? "text-amber-800 dark:text-amber-300" : "text-zinc-400"}`}>
                        {issue ?? "An engineer reviews it before it appears for everyone."}
                    </Text>
                </Footer>
            </KeyboardAvoidingView>
        </Screen>
    );
}