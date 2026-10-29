import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { organizationScopedColumns } from "./columns";
import { user } from "../auth";

/** Generic "a file is attached to X" — asset photos, work order completion photos, meter-reading proofs, one mechanism. */
export const attachments = pgTable(
    "attachments",
    {
        id: text("id").primaryKey().$defaultFn(() => createId()),
        ...organizationScopedColumns(),
        subjectType: text("subject_type").notNull(),
        subjectId: text("subject_id").notNull(),
        storagePath: text("storage_path").notNull(),
        mimeType: text("mime_type").notNull(),
        uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => user.id),
        uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index("attachments_subject_idx").on(table.subjectType, table.subjectId)],
);