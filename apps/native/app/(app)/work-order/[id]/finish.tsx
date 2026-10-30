import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SearchX } from "lucide-react-native";
import { AttachmentPicker } from "../../../../components/attachment-picker";
import { Button, Chip, EmptyState, Field, Footer, Header, Screen, Segmented } from "../../../../components/ui";
import { useApp } from "../../../../lib/app-state";
import type { Attachment } from "../../../../lib/attachments";
import { FINISH_OUTCOMES, HOLD_REASONS, OUTCOME_LABEL, type Outcome } from "../../../../lib/work-orders";

type Mode = "complete" | "incomplete";

/**
 * The whole field flow: did you finish it or not, with a photo. Finished needs a
 * photo of the work. Not finished needs a reason, and a photo if it helps.
 */
export default function FinishWorkOrder() {
    const { id, mode: initial } = useLocalSearchParams<{ id: string; mode?: Mode }>();
    const router = useRouter();
    const { workOrders, completeWorkOrder, holdWorkOrder } = useApp();
    const order = workOrders.find((o) => o.id === id);

    const [mode, setMode] = useState<Mode>(initial === "incomplete" ? "incomplete" : "complete");
    const [outcome, setOutcome] = useState<Outcome>("done");
    const [reason, setReason] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    if (!order) {
        return (
            <Screen edges={["top", "bottom"]}>
                <Header title="Work order" />
                <EmptyState icon={SearchX} title="Work order not found" />
            </Screen>
        );
    }

    const done = mode === "complete";
    const photoCount = attachments.filter((a) => a.kind === "photo").length;
    const noteNeeded = done ? outcome === "no_fault" : reason === "Other";
    const issue = done
        ? photoCount === 0 ? "Take a photo of the finished work" : noteNeeded && !note.trim() ? "Say what you checked" : null
        : !reason ? "Choose a reason" : noteNeeded && !note.trim() ? "Add a short note" : null;

    function save() {
        if (issue) return;
        if (done) completeWorkOrder(order!.id, { outcome, note: note.trim(), attachments });
        else holdWorkOrder(order!.id, { reason: reason!, note: note.trim(), attachments });
        router.back();
    }

    return (
        <Screen edges={["top", "bottom"]}>
            <Header title="Finish job" subtitle={order.title} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
                    <Segmented<Mode> value={mode} onChange={setMode} options={[{ value: "complete", label: "Completed" }, { value: "incomplete", label: "Couldn't finish" }]} />

                    {done ? (
                        <View className="gap-2">
                            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">What was the result?</Text>
                            <View className="flex-row flex-wrap gap-2">
                                {FINISH_OUTCOMES.map((o) => <Chip key={o} label={OUTCOME_LABEL[o]} active={outcome === o} onPress={() => setOutcome(o)} />)}
                            </View>
                        </View>
                    ) : (
                        <View className="gap-2">
                            <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Why couldn't you finish?</Text>
                            <View className="flex-row flex-wrap gap-2">
                                {HOLD_REASONS.map((r) => <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />)}
                            </View>
                        </View>
                    )}

                    <AttachmentPicker
                        items={attachments}
                        onChange={setAttachments}
                        photoRule={done ? "required" : "optional"}
                        allowFiles={false}
                        hint={done ? "A clear photo of the finished work, from where you did it." : "A photo of what's in the way helps the office plan the next visit."}
                    />

                    <Field
                        label={noteNeeded ? "Note" : "Note (optional)"}
                        value={note}
                        onChangeText={setNote}
                        multiline
                        maxLength={2000}
                        placeholder={done ? "Anything the office should know?" : "What's in the way? What's needed to carry on?"}
                        hint={`${note.length}/2000`}
                    />
                </ScrollView>
                <Footer>
                    <Button label={done ? "Mark complete" : "Report not finished"} disabled={!!issue} onPress={save} />
                    <Text className={`pb-1 text-center text-sm ${issue ? "text-amber-800 dark:text-amber-300" : "text-zinc-400"}`}>
                        {issue ?? (done ? "Saved on this phone and uploaded when you're online." : "The office will see why and can reassign or reschedule it.")}
                    </Text>
                </Footer>
            </KeyboardAvoidingView>
        </Screen>
    );
}