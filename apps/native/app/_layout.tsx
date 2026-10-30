import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProvider, useApp } from "../lib/app-state";
import { LocationProvider } from "../lib/location";

/** Signed-out users only see (auth); signed-in users only see (app). */
function Routes() {
    const { signedIn } = useApp();
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={signedIn}>
                <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={!signedIn}>
                <Stack.Screen name="(auth)" />
            </Stack.Protected>
        </Stack>
    );
}

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <AppProvider>
                <LocationProvider>
                    <StatusBar style="auto" />
                    <Routes />
                </LocationProvider>
            </AppProvider>
        </GestureHandlerRootView>
    );
}