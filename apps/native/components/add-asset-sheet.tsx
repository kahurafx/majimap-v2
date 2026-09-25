import { Modal, View, Text, TouchableOpacity, Pressable } from "react-native";
import { MapPin, CircleDot, Route } from "lucide-react-native";

const OPTIONS = [
    { key: "node", label: "Add node", icon: MapPin },
    { key: "valve", label: "Add valve", icon: CircleDot },
    { key: "pipe", label: "Add pipeline", icon: Route },
];

export default function AddAssetSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/40" onPress={onClose} />
            <View className="bg-white dark:bg-zinc-950 rounded-t-2xl px-5 pt-4 pb-8 gap-1">
                <View className="w-9 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 self-center mb-3" />
                {OPTIONS.map((opt, i) => (
                    <TouchableOpacity
                        key={opt.key}
                        onPress={() => {
                            onClose();
                            // TODO: route into the add-asset flow once it's designed.
                        }}
                        className={`flex-row items-center gap-3 py-3.5 ${i < OPTIONS.length - 1 ? "border-b border-zinc-100 dark:border-zinc-900" : ""}`}
                    >
                        <View className="h-9 w-9 rounded-lg bg-blue-600/10 dark:bg-blue-500/15 items-center justify-center">
                            <opt.icon size={17} color="#2563EB" />
                        </View>
                        <Text className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{opt.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </Modal>
    );
}