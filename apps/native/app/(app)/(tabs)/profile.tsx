import { useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { Building2, Check, CloudOff, Fingerprint, LogOut } from "lucide-react-native";
import type { Role } from "@majimap/shared-types";
import { Button, Card, Divider, Screen, SectionHeader, Segmented } from "../../../components/ui";
import { useApp } from "../../../../native/lib/app-state";
import { ROLE_ABILITIES, ROLE_LABEL } from "../../../../native/lib/permissions";
import { TAB_SPACE, useColors } from "../../../../native/lib/theme";

export default function ProfileScreen() {
    const c = useColors();
    const { user, org, role, setRole, online, setOnline, signOut } = useApp();
    const [biometric, setBiometric] = useState(true);
    const initials = user.name.split(" ").map((p) => p[0]).join("").slice(0, 2);

    const Row = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
        <View className="min-h-16 flex-row items-center gap-3 px-4 py-3">
            {icon}
            <Text className="flex-1 text-base text-zinc-900 dark:text-zinc-50">{label}</Text>
            {children}
        </View>
    );

    return (
        <Screen>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: TAB_SPACE + 16 }} showsVerticalScrollIndicator={false}>
                <Text className="px-1 pb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Profile</Text>

                <Card className="flex-row items-center gap-4 p-4">
                    <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-600">
                        <Text className="text-xl font-bold text-white">{initials}</Text>
                    </View>
                    <View className="flex-1 gap-0.5">
                        <Text className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{user.name}</Text>
                        <Text className="text-sm text-zinc-500 dark:text-zinc-400">{user.username}.{org.slug}</Text>
                        <View className="mt-1 flex-row items-center gap-1.5">
                            <Building2 size={14} color={c.muted} />
                            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{org.name}</Text>
                        </View>
                    </View>
                </Card>

                <SectionHeader title={`What a ${ROLE_LABEL[role].toLowerCase()} can do`} />
                <Card className="gap-3 p-4">
                    {ROLE_ABILITIES[role].map((a) => (
                        <View key={a} className="flex-row items-start gap-2.5">
                            <Check size={18} color="#047857" style={{ marginTop: 2 }} />
                            <Text className="flex-1 text-base text-zinc-700 dark:text-zinc-300">{a}</Text>
                        </View>
                    ))}
                </Card>

                <SectionHeader title="Security" />
                <Card className="overflow-hidden">
                    <Row icon={<Fingerprint size={22} color={c.muted} />} label="Unlock with fingerprint">
                        <Switch value={biometric} onValueChange={setBiometric} />
                    </Row>
                </Card>

                <SectionHeader title="Design preview" />
                <Card className="gap-4 p-4">
                    <Text className="text-sm text-zinc-500 dark:text-zinc-400">Temporary controls for reviewing the mock-ups. Remove once real sign-in is wired.</Text>
                    <View className="gap-2">
                        <Text className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">View the app as</Text>
                        <Segmented<Role>
                            value={role}
                            onChange={setRole}
                            options={[
                                { value: "admin", label: "Admin" },
                                { value: "gis_engineer", label: "Engineer" },
                                { value: "field_technician", label: "Tech" },
                                { value: "viewer", label: "Viewer" },
                            ]}
                        />
                    </View>
                    <Divider />
                    <View className="flex-row items-center gap-3">
                        <CloudOff size={20} color={c.muted} />
                        <Text className="flex-1 text-base text-zinc-900 dark:text-zinc-50">Simulate offline</Text>
                        <Switch value={!online} onValueChange={(v) => setOnline(!v)} />
                    </View>
                </Card>

                <View className="mt-6 gap-3">
                    <Button label="Sign out" variant="secondary" icon={LogOut} onPress={signOut} />
                    <Text className="text-center text-sm text-zinc-400">Majimap 1.0.0 · GIS</Text>
                </View>
            </ScrollView>
        </Screen>
    );
}
