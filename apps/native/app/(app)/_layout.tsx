import { Stack } from "expo-router";
import { useColors } from "../../lib/theme";

/** Tabs are the shell; everything else is a stack screen pushed above them with a back key. */
export default function AppLayout() {
    const c = useColors();
    return (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background }, animation: "slide_from_right" }}>
            <Stack.Screen name="(tabs)" />
        </Stack>
    );
}
