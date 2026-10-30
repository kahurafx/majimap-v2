import { Modal, Pressable, Switch, Text, View } from "react-native";
import { CONDITION_HEX, type Condition } from "@majimap/shared-types";
import { SUBNETWORK_FALLBACK } from "../lib/map-style";
import { CONDITION_LABEL } from "../lib/theme";
import { Segmented } from "./ui";

export type ColorMode = "condition" | "subnetwork";
const CONDITIONS: Condition[] = ["good", "fair", "poor", "critical", "unknown"];

const Swatch = ({ color, label }: { color: string; label: string }) => (
    <View className="flex-row items-center gap-2">
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
        <Text className="text-sm text-zinc-600 dark:text-zinc-400">{label}</Text>
    </View>
);

export function MapLayersSheet({
                                   visible, onClose, colorMode, onColorMode, showDmas, onShowDmas, showPipes, onShowPipes, subnetworks,
                               }: {
    visible: boolean; onClose: () => void;
    colorMode: ColorMode; onColorMode: (m: ColorMode) => void;
    showDmas: boolean; onShowDmas: (v: boolean) => void;
    showPipes: boolean; onShowPipes: (v: boolean) => void;
    subnetworks: { id: string; name: string; color: string }[];
}) {
    const Row = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
        <View className="min-h-14 flex-row items-center justify-between">
            <Text className="text-base text-zinc-900 dark:text-zinc-50">{label}</Text>
            <Switch value={value} onValueChange={onChange} />
        </View>
    );

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="Close" />
            <View className="gap-4 rounded-t-3xl bg-white px-4 pb-10 pt-3 dark:bg-zinc-950">
                <View className="h-1.5 w-10 self-center rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <Text className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Map layers</Text>

                <View className="gap-2">
                    <Text className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Colour assets by</Text>
                    <Segmented<ColorMode> value={colorMode} onChange={onColorMode} options={[{ value: "condition", label: "Condition" }, { value: "subnetwork", label: "Subnetwork" }]} />
                    <View className="flex-row flex-wrap gap-x-4 gap-y-2 pt-1">
                        {colorMode === "condition"
                            ? CONDITIONS.map((c) => <Swatch key={c} color={CONDITION_HEX[c]} label={CONDITION_LABEL[c]} />)
                            : [...subnetworks.map((s) => <Swatch key={s.id} color={s.color} label={s.name} />), <Swatch key="none" color={SUBNETWORK_FALLBACK} label="Not in a subnetwork" />]}
                    </View>
                </View>

                <View>
                    <Row label="District metered areas (DMAs)" value={showDmas} onChange={onShowDmas} />
                    <Row label="Pipes" value={showPipes} onChange={onShowPipes} />
                </View>
            </View>
        </Modal>
    );
}