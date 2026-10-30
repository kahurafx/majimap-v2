import { Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ClipboardCheck, CircleDot, MapPin, Route, Box, type LucideIcon } from "lucide-react-native";
import { useColors } from "../../native/lib/theme";

type Action = { key: string; label: string; hint: string; icon: LucideIcon; href: { pathname: string; params?: Record<string, string> } };

const ACTIONS: Action[] = [
    { key: "inspect", label: "Record inspection", hint: "Log the condition of an asset", icon: ClipboardCheck, href: { pathname: "/select-asset", params: { purpose: "inspect" } } },
    { key: "valve", label: "Operate a valve", hint: "Log a valve opened or closed", icon: CircleDot, href: { pathname: "/select-asset", params: { purpose: "valve" } } },
    { key: "node", label: "Add a node", hint: "Valve, meter, hydrant, junction…", icon: MapPin, href: { pathname: "/add-asset", params: { kind: "node" } } },
    { key: "pipe", label: "Add a pipe", hint: "Connect two existing nodes", icon: Route, href: { pathname: "/add-asset", params: { kind: "pipe" } } },
    { key: "structure", label: "Add a structure", hint: "Manhole, chamber, vault, kiosk", icon: Box, href: { pathname: "/add-asset", params: { kind: "structure" } } },
];

export default function QuickActionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const router = useRouter();
    const c = useColors();
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="Close" />
            <View className="rounded-t-3xl bg-white px-4 pb-10 pt-3 dark:bg-zinc-950">
                <View className="mb-2 h-1.5 w-10 self-center rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <Text className="px-2 pb-2 pt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">What would you like to do?</Text>
                {ACTIONS.map((a) => (
                    <Pressable
                        key={a.key}
                        onPress={() => { onClose(); router.push(a.href as never); }}
                        accessibilityRole="button"
                        className="min-h-[64px] flex-row items-center gap-3 rounded-2xl px-2 py-2.5 active:bg-zinc-100 dark:active:bg-zinc-900"
                    >
                        <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-600/20">
                            <a.icon size={21} color={c.brand} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{a.label}</Text>
                            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{a.hint}</Text>
                        </View>
                    </Pressable>
                ))}
            </View>
        </Modal>
    );
}
