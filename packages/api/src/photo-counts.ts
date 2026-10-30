import { and, eq, inArray, like, sql } from "drizzle-orm";
import { attachments, type Database } from "@majimap/db";
import type { AttachmentSubject } from "@majimap/shared-types";

/** Uploaded photos per subject. A file counts only once the server has seen its bytes. */
export async function photoCounts(db: Database, orgId: string, subjectType: AttachmentSubject, ids: readonly string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await db
        .select({ id: attachments.subjectId, n: sql<number>`count(*)::int` })
        .from(attachments)
        .where(
            and(
                eq(attachments.organizationId, orgId),
                eq(attachments.subjectType, subjectType),
                inArray(attachments.subjectId, [...ids]),
                eq(attachments.status, "uploaded"),
                like(attachments.mimeType, "image/%"),
            ),
        )
        .groupBy(attachments.subjectId);
    return new Map(rows.map((r) => [r.id, r.n]));
}