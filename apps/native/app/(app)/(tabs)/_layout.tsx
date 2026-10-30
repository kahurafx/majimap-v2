import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { House, List, Map as MapIcon, Plus, User, type LucideIcon } from "lucide-react-native";
import QuickActionsSheet from "../../../components/quick-actions-sheet";
import { useApp } from "../../../../native/lib/app-state";
import { can } from "../../../../native/lib/permissions";
import { useColors } from "../../../../native/lib/theme";

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
    index: { label: "Home", icon: House },
    map: { label: "Map", icon: MapIcon },
    assets: { label: "Assets", icon: List },
    profile: { label: "Profile", icon: User },
};

/** Floating pill. Same for every role; the + only appears for roles that can write. */
function TabBar({ state, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const c = useColors();
    const { role } = useApp();
    const [open, setOpen] = useState(false);

    const routes = state.routes.filter((r) => r.name in TABS);
    const left = routes.slice(0, 2);
    const right = routes.slice(2);

    const renderTab = (route: (typeof routes)[number]) => {
        const focused = state.routes[state.index]?.key === route.key;
        const { label, icon: Icon } = TABS[route.name]!;
        return (
            <Pressable
                key={route.key}
                onPress={() => navigation.navigate(route.name)}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                className={focused ? "h-14 flex-1 items-center justify-center gap-0.5 rounded-2xl bg-brand-600/10 dark:bg-brand-600/20" : "h-14 flex-1 items-center justify-center gap-0.5 rounded-2xl"}
            >
                <Icon size={22} color={focused ? c.brand : c.muted} />
                <Text className={focused ? "text-xs font-semibold text-brand-700 dark:text-brand-400" : "text-xs font-medium text-zinc-500 dark:text-zinc-400"}>{label}</Text>
            </Pressable>
        );
    };

    return (
        <View pointerEvents="box-none" style={{ position: "absolute", left: 12, right: 12, bottom: Math.max(insets.bottom, 12) }}>
            <View className="flex-row items-center gap-1 rounded-[30px] border border-zinc-200 bg-white/95 p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900/95">
                {left.map(renderTab)}
                {can.write(role) && (
                    <Pressable
                        onPress={() => setOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Quick actions"
                        className="mx-1 h-14 w-14 items-center justify-center rounded-full bg-brand-600 active:bg-brand-700"
                    >
                        <Plus size={26} color="#fff" />
                    </Pressable>
                )}
                {right.map(renderTab)}
            </View>
            <QuickActionsSheet visible={open} onClose={() => setOpen(false)} />
        </View>
    );
}

export default function TabsLayout() {
    return (
        <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
            <Tabs.Screen name="index" options={{ title: "Home" }} />
            <Tabs.Screen name="map" options={{ title: "Map" }} />
            <Tabs.Screen name="assets" options={{ title: "Assets" }} />
            <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        </Tabs>
    );
}
