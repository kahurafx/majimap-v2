import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import { Map, List, Cloud, User, Plus } from "lucide-react-native";
import AddAssetSheet from "../../components/add-asset-sheet";
import {BottomTabBarProps} from "expo-router/js-tabs";
// import {BottomTabBarProps} from "@react-navigation/bottom-tabs";

const ICONS: Record<string, any> = { map: Map, assets: List, sync: Cloud, profile: User };
const LABELS: Record<string, string> = { map: "Map", assets: "Assets", sync: "Sync", profile: "Profile" };

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const [addOpen, setAddOpen] = useState(false);
    const left = state.routes.slice(0, 2);
    const right = state.routes.slice(2);

    const renderTab = (route: (typeof state.routes)[number]) => {
        const routeIndex = state.routes.findIndex((r) => r.key === route.key);
        const isFocused = state.index === routeIndex;
        const Icon = ICONS[route.name];
        return (
            <TouchableOpacity key={route.key} onPress={() => navigation.navigate(route.name)} className="items-center gap-1 flex-1">
                <Icon size={19} color={isFocused ? "#2563EB" : "#9CA3AF"} />
                <Text className={isFocused ? "text-[9.5px] font-medium text-blue-600" : "text-[9.5px] text-zinc-400"}>{LABELS[route.name]}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={{ paddingBottom: insets.bottom || 10 }} className="bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 pt-2">
            <View className="flex-row items-center">
                {left.map(renderTab)}
                <View className="w-14" />
                {right.map(renderTab)}
            </View>
            <TouchableOpacity
                onPress={() => setAddOpen(true)}
                style={{ top: -22, left: "50%", marginLeft: -24 }}
                className="absolute h-12 w-12 rounded-full bg-blue-600 items-center justify-center shadow-lg"
            >
                <Plus size={22} color="#fff" />
            </TouchableOpacity>
            <AddAssetSheet visible={addOpen} onClose={() => setAddOpen(false)} />
        </View>
    );
}

export default function AppLayout() {
    return (
        <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
            <Tabs.Screen name="map" options={{ title: "Map" }} />
            <Tabs.Screen name="assets" options={{ title: "Assets" }} />
            <Tabs.Screen name="sync" options={{ title: "Sync" }} />
            <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        </Tabs>
    );
}