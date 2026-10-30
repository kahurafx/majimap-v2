import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
// import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, type LucideIcon } from "lucide-react-native";
import { CONDITION_HEX, type Condition } from "@majimap/shared-types";
import { CONDITION_LABEL, useColors } from "../../native/lib/theme";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export function Screen({ children, edges = ["top"] }: { children: ReactNode; edges?: Edge[] }) {
    const insets = useSafeAreaInsets();
    return (
        <View
            className="flex-1 bg-zinc-50 dark:bg-zinc-950"
            style={{ paddingTop: edges.includes("top") ? insets.top : 0, paddingBottom: edges.includes("bottom") ? insets.bottom : 0 }}
        >
            {children}
        </View>
    );
}

/** Header for stack screens: always a back key, per the navigation model. */
export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
    const router = useRouter();
    const c = useColors();
    return (
        <View className="min-h-16 flex-row items-center gap-1 px-3 py-2">
            <Pressable
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                className="h-12 w-12 items-center justify-center rounded-full active:bg-zinc-200/70 dark:active:bg-zinc-800"
            >
                <ChevronLeft size={26} color={c.text} />
            </Pressable>
            <View className="flex-1">
                <Text numberOfLines={1} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</Text>
                {subtitle ? <Text numberOfLines={1} className="text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</Text> : null}
            </View>
            {right}
        </View>
    );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <View className={cx("rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900", className)}>
            {children}
        </View>
    );
}

export const Divider = () => <View className="h-px bg-zinc-100 dark:bg-zinc-800" />;

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
    return (
        <View className="mb-2 mt-6 flex-row items-center justify-between px-1">
            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</Text>
            {action ? (
                <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
                    <Text className="text-sm font-medium text-brand-700 dark:text-brand-400">{action}</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const BUTTON: Record<Variant, { box: string; text: string }> = {
    primary: { box: "bg-brand-600 active:bg-brand-700", text: "text-white" },
    danger: { box: "bg-red-700 active:bg-red-800", text: "text-white" },
    secondary: {
        box: "border border-zinc-300 bg-white active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800",
        text: "text-zinc-900 dark:text-zinc-50",
    },
    ghost: { box: "active:bg-zinc-200/60 dark:active:bg-zinc-800", text: "text-brand-700 dark:text-brand-400" },
};

export function Button({
    label, onPress, variant = "primary", icon: Icon, loading, disabled, className,
}: {
    label: string; onPress?: () => void; variant?: Variant; icon?: LucideIcon; loading?: boolean; disabled?: boolean; className?: string;
}) {
    const c = useColors();
    const iconColor = variant === "primary" || variant === "danger" ? "#ffffff" : variant === "ghost" ? c.brand : c.text;
    const off = disabled || loading;
    return (
        <Pressable
            onPress={off ? undefined : onPress}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!off }}
            className={cx("h-14 flex-row items-center justify-center gap-2 rounded-2xl px-5", BUTTON[variant].box, off && "opacity-40", className)}
        >
            {loading ? <ActivityIndicator color={iconColor} /> : Icon ? <Icon size={20} color={iconColor} /> : null}
            <Text className={cx("text-base font-semibold", BUTTON[variant].text)}>{label}</Text>
        </Pressable>
    );
}

export function Chip({ label, active, onPress, dot }: { label: string; active?: boolean; onPress?: () => void; dot?: string }) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: !!active }}
            className={cx(
                "h-10 flex-row items-center gap-2 rounded-full border px-4",
                active ? "border-brand-600 bg-brand-600" : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900",
            )}
        >
            {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
            <Text className={cx("text-sm font-medium", active ? "text-white" : "text-zinc-700 dark:text-zinc-300")}>{label}</Text>
        </Pressable>
    );
}

export function ConditionBadge({ condition }: { condition: Condition }) {
    return (
        <View className="flex-row items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CONDITION_HEX[condition] }} />
            <Text className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">{CONDITION_LABEL[condition]}</Text>
        </View>
    );
}

type Tone = "neutral" | "info" | "ok" | "warn" | "danger";
const TONE: Record<Tone, { box: string; text: string }> = {
    neutral: { box: "bg-zinc-200/70 dark:bg-zinc-800", text: "text-zinc-700 dark:text-zinc-300" },
    info: { box: "bg-brand-100 dark:bg-brand-600/25", text: "text-brand-700 dark:text-brand-400" },
    ok: { box: "bg-emerald-100 dark:bg-emerald-500/20", text: "text-emerald-800 dark:text-emerald-300" },
    warn: { box: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-900 dark:text-amber-300" },
    danger: { box: "bg-red-100 dark:bg-red-500/20", text: "text-red-800 dark:text-red-300" },
};

export function StatusPill({ label, tone = "neutral", icon: Icon, onPress }: { label: string; tone?: Tone; icon?: LucideIcon; onPress?: () => void }) {
    const iconColor = { neutral: "#52525b", info: "#1d4ed8", ok: "#047857", warn: "#b45309", danger: "#b91c1c" }[tone];
    const body = (
        <View className={cx("flex-row items-center gap-1.5 self-start rounded-full px-3 py-1.5", TONE[tone].box)}>
            {Icon ? <Icon size={14} color={iconColor} /> : null}
            <Text className={cx("text-[13px] font-semibold", TONE[tone].text)}>{label}</Text>
        </View>
    );
    return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{body}</Pressable> : body;
}

export function Field({
    label, hint, error, className, ...props
}: { label: string; hint?: string; error?: string; className?: string } & TextInputProps) {
    const c = useColors();
    return (
        <View className={cx("gap-1.5", className)}>
            <Text className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{label}</Text>
            <TextInput
                placeholderTextColor={c.faint}
                {...props}
                className={cx(
                    "rounded-xl border bg-white px-4 text-base text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50",
                    props.multiline ? "min-h-28 py-3" : "h-14",
                    error ? "border-red-600" : "border-zinc-300 dark:border-zinc-700",
                )}
                style={props.multiline ? { textAlignVertical: "top" } : undefined}
            />
            {error ? <Text className="text-sm text-red-700 dark:text-red-400">{error}</Text> : hint ? <Text className="text-sm text-zinc-500 dark:text-zinc-400">{hint}</Text> : null}
        </View>
    );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
    return (
        <View className="flex-row rounded-xl bg-zinc-200/70 p-1 dark:bg-zinc-800">
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <Pressable
                        key={o.value}
                        onPress={() => onChange(o.value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className={cx("h-11 flex-1 items-center justify-center rounded-lg", active && "bg-white dark:bg-zinc-950")}
                    >
                        <Text className={cx("text-sm font-semibold", active ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-400")}>{o.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

export function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body?: string }) {
    const c = useColors();
    return (
        <View className="items-center gap-2 px-8 py-12">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <Icon size={26} color={c.muted} />
            </View>
            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</Text>
            {body ? <Text className="text-center text-sm text-zinc-500 dark:text-zinc-400">{body}</Text> : null}
        </View>
    );
}

/** Sticky bottom bar for primary actions on form screens. */
export function Footer({ children }: { children: ReactNode }) {
    return <View className="gap-2 border-t border-zinc-200 bg-white px-4 pb-2 pt-3 dark:border-zinc-800 dark:bg-zinc-950">{children}</View>;
}
