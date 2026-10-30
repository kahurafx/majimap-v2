import { useColorScheme } from "react-native";
import type { Condition } from "@majimap/shared-types";

/** Mirrors --color-brand-* in global.css. */
export const BRAND = {
    50: "#eff6ff",
    100: "#dbeafe",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
} as const;

/** Space a screen must leave at the bottom for the floating tab bar. */
export const TAB_SPACE = 104;

/** Hex values for places classNames can't reach (icon colors, SVG). */
export function useColors() {
    const dark = useColorScheme() === "dark";
    return {
        dark,
        brand: dark ? BRAND[400] : BRAND[600],
        text: dark ? "#fafafa" : "#18181b",
        muted: dark ? "#a1a1aa" : "#71717a",
        faint: dark ? "#71717a" : "#a1a1aa",
        surface: dark ? "#18181b" : "#ffffff",
        background: dark ? "#09090b" : "#fafafa",
        border: dark ? "#27272a" : "#e4e4e7",
    };
}

export const CONDITION_LABEL: Record<Condition, string> = {
    good: "Good",
    fair: "Fair",
    poor: "Poor",
    critical: "Critical",
    unknown: "Unknown",
};

export const CONDITION_HINT: Record<Condition, string> = {
    good: "Working normally",
    fair: "Minor wear, no action yet",
    poor: "Needs repair soon",
    critical: "Failed or unsafe",
    unknown: "Couldn't assess it",
};
