import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { Droplet, Fingerprint } from "lucide-react-native";

export default function LoginScreen() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSignIn() {
        if (!username || !password) return;
        setLoading(true);
        // TODO: replace with the real auth call once the API exists.
        await new Promise((r) => setTimeout(r, 600));
        setLoading(false);
        router.replace("/(app)/map");
    }

    async function handleBiometric() {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) return;
        const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Sign in to Conduit" });
        if (result.success) router.replace("/(app)/map");
    }

    return (
        <SafeAreaView className="flex-1 bg-white dark:bg-zinc-950">
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-center px-6 gap-4">
                <View className="items-center gap-2 mb-2">
                    <View className="h-14 w-14 rounded-2xl bg-blue-600/10 dark:bg-blue-500/15 items-center justify-center">
                        <Droplet size={28} color="#2563EB" />
                    </View>
                    <Text className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Conduit</Text>
                    <Text className="text-xs text-zinc-500 dark:text-zinc-400 text-center">Field operations for water networks</Text>
                </View>

                <View className="gap-1.5">
                    <Text className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Username</Text>
                    <TextInput
                        value={username}
                        onChangeText={setUsername}
                        placeholder="a.odhiambo"
                        placeholderTextColor="#9CA3AF"
                        autoCapitalize="none"
                        autoCorrect={false}
                        className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-3 text-sm text-zinc-900 dark:text-zinc-50"
                    />
                </View>

                <View className="gap-1.5">
                    <Text className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Password</Text>
                    <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder="••••••••"
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry
                        className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-3 text-sm text-zinc-900 dark:text-zinc-50"
                    />
                </View>

                <TouchableOpacity onPress={handleSignIn} disabled={loading} className="bg-blue-600 dark:bg-blue-500 rounded-xl py-3.5 items-center mt-1">
                    {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-sm font-semibold">Sign in</Text>}
                </TouchableOpacity>

                <TouchableOpacity>
                    <Text className="text-xs text-blue-600 dark:text-blue-400 text-center">Forgot password?</Text>
                </TouchableOpacity>

                <View className="flex-row items-center gap-3 my-1">
                    <View className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                    <Text className="text-[11px] text-zinc-400">or</Text>
                    <View className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                </View>

                <TouchableOpacity onPress={handleBiometric} className="flex-row items-center justify-center gap-2 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3">
                    <Fingerprint size={16} color="#71717A" />
                    <Text className="text-sm text-zinc-700 dark:text-zinc-300">Use fingerprint</Text>
                </TouchableOpacity>

                <Text className="text-[10.5px] text-zinc-400 dark:text-zinc-500 text-center leading-relaxed px-2 mt-2">
                    You'll stay signed in offline. Any changes you make sync automatically once you're back online.
                </Text>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}