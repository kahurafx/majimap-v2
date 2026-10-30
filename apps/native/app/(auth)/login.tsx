import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Droplet, Eye, EyeOff, Fingerprint, Info } from "lucide-react-native";
import { useApp } from "../../../native/lib/app-state";
import { useColors } from "../../../native/lib/theme";
import { Button, Field, Screen } from "../../components/ui"

/**
 * Accounts are created by organization admins, so there is no sign-up here.
 * The server stores usernames namespaced as `username.orgslug`; the person
 * types the plain username and the organization code separately.
 *
 * Demo behaviour: any credentials work. A username containing "admin", "eng"
 * or "view" signs in with that role (otherwise technician). Password "wrong"
 * shows the error state.
 */
export default function LoginScreen() {
    const c = useColors();
    const { signIn, savedOrgCode, hasSignedInBefore } = useApp();
    const [orgCode, setOrgCode] = useState(savedOrgCode || "kwsc");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [show, setShow] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [help, setHelp] = useState(false);
    const [bioNote, setBioNote] = useState<string | null>(null);

    const ready = orgCode.trim() && username.trim() && password;

    async function submit() {
        if (!ready || loading) return;
        setLoading(true);
        setError(null);
        const res = await signIn({ orgCode, username, password });
        setLoading(false);
        if (!res.ok) setError(res.error);
    }

    async function biometric() {
        setBioNote(null);
        if (!hasSignedInBefore) {
            setBioNote("Sign in with your password once, then fingerprint unlock will work on this device.");
            return;
        }
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !enrolled) {
            setBioNote("Fingerprint isn't set up on this phone.");
            return;
        }
        const res = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Majimap" });
        if (res.success) await signIn({ orgCode: savedOrgCode, username: "a.odhiambo", password: "stored" });
    }

    return (
        <Screen edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", gap: 20, paddingHorizontal: 24, paddingVertical: 32 }} keyboardShouldPersistTaps="handled">
                    <View className="mb-2 items-center gap-3">
                        <View className="h-16 w-16 items-center justify-center rounded-3xl bg-brand-600">
                            <Droplet size={32} color="#fff" />
                        </View>
                        <View className="items-center gap-1">
                            <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Majimap</Text>
                            <Text className="text-center text-base text-zinc-500 dark:text-zinc-400">Field operations for water networks</Text>
                        </View>
                    </View>

                    <Field
                        label="Organization code"
                        value={orgCode}
                        onChangeText={setOrgCode}
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="e.g. kwsc"
                        hint={savedOrgCode ? "Remembered on this device." : "Ask your administrator if you don't know it."}
                    />
                    <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="a.odhiambo" textContentType="username" />

                    <View className="gap-1.5">
                        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry={!show} placeholder="••••••••" textContentType="password" autoCapitalize="none" />
                        <Pressable onPress={() => setShow((s) => !s)} hitSlop={8} className="absolute right-1 top-7 h-14 w-12 items-center justify-center" accessibilityLabel={show ? "Hide password" : "Show password"}>
                            {show ? <EyeOff size={20} color={c.muted} /> : <Eye size={20} color={c.muted} />}
                        </Pressable>
                    </View>

                    {error && (
                        <View className="flex-row gap-2 rounded-xl bg-red-100 p-3 dark:bg-red-500/15">
                            <Info size={18} color="#b91c1c" />
                            <Text className="flex-1 text-sm text-red-800 dark:text-red-300">{error}</Text>
                        </View>
                    )}

                    <Button label="Sign in" onPress={submit} loading={loading} disabled={!ready} />

                    <Pressable onPress={() => setHelp((h) => !h)} hitSlop={8} className="items-center py-1">
                        <Text className="text-sm font-medium text-brand-700 dark:text-brand-400">Can't sign in?</Text>
                    </Pressable>
                    {help && (
                        <Text className="rounded-xl bg-zinc-100 p-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                            Accounts and password resets are handled by your organization's administrator. Contact them and they can help you get back in.
                        </Text>
                    )}

                    <View className="flex-row items-center gap-3">
                        <View className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                        <Text className="text-sm text-zinc-400">or</Text>
                        <View className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    </View>

                    <Button label="Use fingerprint" variant="secondary" icon={Fingerprint} onPress={biometric} />
                    {bioNote && <Text className="text-center text-sm text-zinc-500 dark:text-zinc-400">{bioNote}</Text>}

                    <Text className="px-4 text-center text-sm text-zinc-400 dark:text-zinc-500">
                        You'll stay signed in while offline. Changes you make sync once you're back online.
                    </Text>
                </ScrollView>
            </KeyboardAvoidingView>
        </Screen>
    );
}
