import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";

/** Maps to a row in the `attachments` table once uploaded (storagePath, mimeType). */
export type Attachment = {
    id: string;
    kind: "photo" | "document";
    /** A file inside app storage, so it survives cache clearing and can wait offline for upload. */
    uri: string;
    name: string;
    mimeType: string;
    sizeBytes: number | null;
};

export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type PickResult =
    | { ok: true; items: Attachment[]; note?: string }
    | { ok: false; reason: "cancelled" | "denied" | "failed"; canAskAgain?: boolean };

const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

/** Pickers hand back cache files the OS may delete. Copy into the documents folder so nothing is lost before it uploads. */
function keepLocally(sourceUri: string, name: string): string {
    const folder = new Directory(Paths.document, "attachments");
    if (!folder.exists) folder.create({ intermediates: true });
    const target = new File(folder, `${uid()}-${name.replace(/[^A-Za-z0-9._-]/g, "_")}`);
    new File(sourceUri).copy(target);
    return target.uri;
}

export function removeLocal(a: Attachment) {
    try {
        new File(a.uri).delete();
    } catch {
        /* already gone */
    }
}

function fromImages(res: ImagePicker.ImagePickerResult): PickResult {
    if (res.canceled) return { ok: false, reason: "cancelled" };
    return {
        ok: true,
        items: res.assets.map((a) => {
            const name = a.fileName ?? `photo-${Date.now()}.jpg`;
            return { id: uid(), kind: "photo" as const, uri: keepLocally(a.uri, name), name, mimeType: a.mimeType ?? "image/jpeg", sizeBytes: a.fileSize ?? null };
        }),
    };
}

/** Opens the camera. Quality 0.7: field connections are slow, and 70% is plenty for an asset photo. */
export async function takePhoto(): Promise<PickResult> {
    try {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return { ok: false, reason: "denied", canAskAgain: perm.canAskAgain };
        return fromImages(await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 }));
    } catch {
        return { ok: false, reason: "failed" };
    }
}

export async function choosePhotos(max: number): Promise<PickResult> {
    try {
        return fromImages(
            await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: max > 1, selectionLimit: max, quality: 0.7 }),
        );
    } catch {
        return { ok: false, reason: "failed" };
    }
}

export async function chooseFiles(max: number): Promise<PickResult> {
    try {
        const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*", "text/*"], multiple: true, copyToCacheDirectory: true });
        if (res.canceled) return { ok: false, reason: "cancelled" };
        const fits = res.assets.filter((a) => (a.size ?? 0) <= MAX_FILE_BYTES);
        const kept = fits.slice(0, max);
        const dropped = res.assets.length - kept.length;
        return {
            ok: true,
            items: kept.map((a) => ({
                id: uid(),
                kind: "document" as const,
                uri: keepLocally(a.uri, a.name),
                name: a.name,
                mimeType: a.mimeType ?? "application/octet-stream",
                sizeBytes: a.size ?? null,
            })),
            note: dropped > 0 ? `${dropped} file${dropped === 1 ? " was" : "s were"} skipped (over 10 MB, or past the limit).` : undefined,
        };
    } catch {
        return { ok: false, reason: "failed" };
    }
}

export const formatSize = (bytes: number | null) =>
    bytes === null ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;