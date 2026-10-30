import { useState } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { Camera, FileText, Image as ImageIcon, Paperclip, X } from "lucide-react-native";
import { MAX_PHOTOS, type PhotoRule } from "../lib/asset-rules";
import { MAX_FILES, choosePhotos, chooseFiles, formatSize, removeLocal, takePhoto, type Attachment, type PickResult } from "../lib/attachments";
import { useColors } from "../lib/theme";
import { Button, StatusPill } from "./ui";

/** Photos (camera or gallery) and, optionally, supporting files such as drawings or data sheets. */
export function AttachmentPicker({
                                     items, onChange, photoRule, allowFiles = true,hint,
                                 }: { items: Attachment[]; onChange: (items: Attachment[]) => void; photoRule: PhotoRule; allowFiles?: boolean, hint?: string }) {
    const c = useColors();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ text: string; settings?: boolean } | null>(null);

    const photos = items.filter((i) => i.kind === "photo");
    const files = items.filter((i) => i.kind === "document");

    async function run(pick: () => Promise<PickResult>) {
        if (busy) return;
        setBusy(true);
        setMessage(null);
        const res = await pick();
        setBusy(false);
        if (res.ok) {
            onChange([...items, ...res.items]);
            if (res.note) setMessage({ text: res.note });
        } else if (res.reason === "denied") {
            setMessage({ text: "Camera access is off. Allow it in Settings to take photos.", settings: !res.canAskAgain });
        } else if (res.reason === "failed") {
            setMessage({ text: "That didn't work. Try again." });
        }
    }

    function remove(a: Attachment) {
        removeLocal(a);
        onChange(items.filter((i) => i.id !== a.id));
    }

    return (
        <View className="gap-4">
            <View className="gap-2">
                <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Photos</Text>
                    <StatusPill label={photoRule === "required" ? "Required" : "Optional"} tone={photoRule === "required" ? "warn" : "neutral"} />
                    <Text className="ml-auto text-sm text-zinc-400">{photos.length}/{MAX_PHOTOS}</Text>
                </View>

                {photos.length > 0 && (
                    <View className="flex-row flex-wrap gap-3">
                        {photos.map((p) => (
                            <View key={p.id}>
                                <Image source={{ uri: p.uri }} style={{ width: 96, height: 96, borderRadius: 16 }} accessibilityLabel={p.name} />
                                <Pressable onPress={() => remove(p)} accessibilityLabel={`Remove ${p.name}`} hitSlop={6} className="absolute right-1 top-1 h-7 w-7 items-center justify-center rounded-full bg-zinc-900/80">
                                    <X size={15} color="#fff" />
                                </Pressable>
                            </View>
                        ))}
                    </View>
                )}

                {photos.length < MAX_PHOTOS && (
                    <View className="flex-row gap-2">
                        <Button label="Take photo" icon={Camera} variant="secondary" disabled={busy} onPress={() => run(takePhoto)} className="h-12 flex-1" />
                        <Button label="Gallery" icon={ImageIcon} variant="secondary" disabled={busy} onPress={() => run(() => choosePhotos(MAX_PHOTOS - photos.length))} className="h-12 flex-1" />
                    </View>
                )}
                <Text className="text-sm text-zinc-400">
                    {hint ?? (photoRule === "required" ? "Take at least one clear photo of the asset." : "A photo helps the next technician find it.")}
                </Text>
            </View>

            {allowFiles && (
                <View className="gap-2">
                    <View className="flex-row items-center gap-2">
                        <Text className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Files</Text>
                        <StatusPill label="Optional" tone="neutral" />
                    </View>
                    {files.map((f) => (
                        <View key={f.id} className="min-h-14 flex-row items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900">
                            <FileText size={20} color={c.muted} />
                            <View className="flex-1">
                                <Text numberOfLines={1} className="text-base text-zinc-900 dark:text-zinc-50">{f.name}</Text>
                                <Text className="text-xs text-zinc-400">{formatSize(f.sizeBytes)}</Text>
                            </View>
                            <Pressable onPress={() => remove(f)} accessibilityLabel={`Remove ${f.name}`} hitSlop={8} className="h-9 w-9 items-center justify-center">
                                <X size={18} color={c.muted} />
                            </Pressable>
                        </View>
                    ))}
                    {files.length < MAX_FILES && (
                        <Button label="Attach a file" icon={Paperclip} variant="secondary" disabled={busy} onPress={() => run(() => chooseFiles(MAX_FILES - files.length))} className="h-12" />
                    )}
                    <Text className="text-sm text-zinc-400">PDFs, images or text, up to 10 MB each. Drawings and data sheets work well.</Text>
                </View>
            )}

            {message && (
                <View className="gap-1">
                    <Text className="text-sm text-amber-800 dark:text-amber-300">{message.text}</Text>
                    {message.settings && (
                        <Pressable onPress={() => Linking.openSettings()} hitSlop={8}>
                            <Text className="text-sm font-semibold text-brand-700 dark:text-brand-400">Open Settings</Text>
                        </Pressable>
                    )}
                </View>
            )}
        </View>
    );
}