import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { ATTACHMENT_SUBJECTS } from "@majimap/shared-types";
import { organizationScopedColumns } from "./columns";
import { user } from "../auth";

export const ATTACHMENT_STATUSES = ["pending", "uploaded"] as const;

/**
 * "A file is attached to X": asset photos, work order completion photos,
 * drawings. Not versioned: a photo is a fact, like a log, so discarding a
 * branch doesn't discard the evidence. The row is created when the device
 * announces the file (`pending`) and flips to `uploaded` once the server has
 * seen the bytes in storage. Ids come from the device so a retry can't duplicate.
 *
 * If this table already has rows, backfill `file_name` and `size_bytes`
 * before the migration makes them NOT NULL.
 */
export const attachments = pgTable(
    "attachments",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        ...organizationScopedColumns(),
        subjectType: text("subject_type", { enum: ATTACHMENT_SUBJECTS }).notNull(),
        subjectId: text("subject_id").notNull(),
        fileName: text("file_name").notNull(),
        storagePath: text("storage_path").notNull(),
        mimeType: text("mime_type").notNull(),
        sizeBytes: integer("size_bytes").notNull(),
        status: text("status", { enum: ATTACHMENT_STATUSES }).notNull().default("pending"),
        uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => user.id),
        uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index("attachments_subject_idx").on(table.subjectType, table.subjectId),
        uniqueIndex("attachments_path_unique").on(table.storagePath),
    ],
);