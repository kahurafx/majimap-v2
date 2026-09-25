import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileScreen() {
    return (
        <SafeAreaView className="flex-1 bg-white dark:bg-zinc-950 items-center justify-center">
            <Text className="text-sm text-zinc-400">Assets list — coming next.</Text>
        </SafeAreaView>
    );
}