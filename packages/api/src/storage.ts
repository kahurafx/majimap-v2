/**
 * Where attachment bytes live. The API only ever hands out short-lived URLs, so
 * files never pass through tRPC. Any S3-compatible service works (R2, Supabase
 * Storage, MinIO, AWS): see the adapter at the end of the notes.
 */

export interface Storage {
    presignPut(key: string, opts: { mimeType: string; sizeBytes: number; expiresInSec: number }): Promise<{ url: string; headers: Record<string, string> }>;
    presignGet(key: string, expiresInSec: number): Promise<string>;
    /** null when there is no such object. */
    head(key: string): Promise<{ sizeBytes: number } | null>;
    delete(key: string): Promise<void>;
}

/** For tests: remembers what was "uploaded" via `put`. */
export function createMemoryStorage() {
    const objects = new Map<string, number>();
    const storage: Storage = {
        presignPut: async (key) => ({ url: `memory://${key}`, headers: {} }),
        presignGet: async (key) => `memory://${key}`,
        head: async (key) => (objects.has(key) ? { sizeBytes: objects.get(key)! } : null),
        delete: async (key) => void objects.delete(key),
    };
    return { storage, put: (key: string, sizeBytes: number) => void objects.set(key, sizeBytes) };
}