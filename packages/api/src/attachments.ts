import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, like, not } from "drizzle-orm";
import { z } from "zod";
import { assets, attachments, workOrders, type Database } from "@majimap/db";
import {
    ATTACHMENT_LIMITS, ATTACHMENT_MIME_TYPES, AttachmentSubjectSchema, type AttachmentDto, type AttachmentSubject, type Role,
} from "@majimap/shared-types";
import { EntityIdSchema } from "./gis/versioning";
import { assertModuleEnabled, loadGisRole, orgProcedure, router } from "./trpc";

type Row = typeof attachments.$inferSelect;
type Caller = { db: Database; organizationId: string; session: { userId: string } };

const WRITE_ROLES: Role[] = ["admin", "gis_engineer", "field_technician"];
const MANAGE_ROLES: Role[] = ["admin", "gis_engineer"];
const UPLOAD_URL_SECONDS = 15 * 60;
const DOWNLOAD_URL_SECONDS = 15 * 60;

const isPhoto = (mime: string) => mime.startsWith("image/");
const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]/g, "_");
const keyFor = (orgId: string, a: { subjectType: string; subjectId: string; id: string; fileName: string }) =>
    `${orgId}/${a.subjectType}/${a.subjectId}/${a.id}/${safeName(a.fileName)}`;

function toDto(row: Row): AttachmentDto {
    return {
        id: row.id,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        fileName: row.fileName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        kind: isPhoto(row.mimeType) ? "photo" : "document",
        status: row.status,
        uploadedByUserId: row.uploadedByUserId,
        uploadedAt: row.uploadedAt.toISOString(),
    };
}

/**
 * One place that answers "may this person touch files on this thing?". The
 * subject must exist in the caller's organization, its module must be on, and
 * writing needs a role that can write. Returns the role for the caller's own checks.
 */
async function authorize(ctx: Caller, subjectType: AttachmentSubject, subjectId: string, mode: "read" | "write"): Promise<Role> {
    const { db, organizationId: orgId, session } = ctx;
    if (subjectType === "work_order") {
        await assertModuleEnabled(db, orgId, "work_orders");
    } else {
        await assertModuleEnabled(db, orgId, "gis");
    }
    const role = await loadGisRole(db, orgId, session.userId); // interim: same role source as work orders

    if (mode === "write" && !WRITE_ROLES.includes(role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: `This action requires one of: ${WRITE_ROLES.join(", ")}` });
    }

    if (subjectType === "work_order") {
        const [order] = await db
            .select({ assignedToUserId: workOrders.assignedToUserId })
            .from(workOrders)
            .where(and(eq(workOrders.id, subjectId), eq(workOrders.organizationId, orgId)))
            .limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });
        if (mode === "write" && order.assignedToUserId && order.assignedToUserId !== session.userId && !MANAGE_ROLES.includes(role)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "This job is assigned to someone else" });
        }
        return role;
    }

    const [asset] = await db
        .select({ assetType: assets.assetType, ownerModule: assets.ownerModule })
        .from(assets)
        .where(and(eq(assets.id, subjectId), eq(assets.organizationId, orgId)))
        .limit(1);
    const matches =
        asset?.ownerModule === "gis" &&
        (subjectType === "pipe" ? asset.assetType === "pipe" : subjectType === "structure" ? asset.assetType === "structure" : !["pipe", "structure", "dma"].includes(asset.assetType));
    // The asset is created before its photos are uploaded; a device that gets this has simply raced ahead and should retry.
    if (!matches) throw new TRPCError({ code: "NOT_FOUND", message: "That asset hasn't reached the server yet" });
    return role;
}

export const attachmentsRouter = router({
    /**
     * Announce a file. Returns where to PUT the bytes. The id comes from the
     * device, so repeating this call is safe: it hands back the same record
     * (and a fresh upload URL if the bytes still haven't arrived).
     */
    create: orgProcedure
        .input(
            z.object({
                id: EntityIdSchema,
                subjectType: AttachmentSubjectSchema,
                subjectId: EntityIdSchema,
                fileName: z.string().trim().min(1).max(200),
                mimeType: z.enum(ATTACHMENT_MIME_TYPES),
                sizeBytes: z.number().int().min(1).max(ATTACHMENT_LIMITS.maxBytes),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await authorize(ctx, input.subjectType, input.subjectId, "write");

            const [existing] = await ctx.db.select().from(attachments).where(eq(attachments.id, input.id)).limit(1);
            if (existing) {
                if (existing.organizationId !== ctx.organizationId || existing.subjectType !== input.subjectType || existing.subjectId !== input.subjectId) {
                    throw new TRPCError({ code: "CONFLICT", message: "That id is already in use" });
                }
                const upload =
                    existing.status === "pending"
                        ? await ctx.storage.presignPut(existing.storagePath, { mimeType: existing.mimeType, sizeBytes: existing.sizeBytes, expiresInSec: UPLOAD_URL_SECONDS })
                        : null;
                return { attachment: toDto(existing), upload };
            }

            const [{ n }] = await ctx.db
                .select({ n: count() })
                .from(attachments)
                .where(
                    and(
                        eq(attachments.subjectType, input.subjectType),
                        eq(attachments.subjectId, input.subjectId),
                        isPhoto(input.mimeType) ? like(attachments.mimeType, "image/%") : not(like(attachments.mimeType, "image/%")),
                    ),
                ) as [{ n: number }];
            const limit = isPhoto(input.mimeType) ? ATTACHMENT_LIMITS.photos : ATTACHMENT_LIMITS.files;
            if (n >= limit) {
                throw new TRPCError({ code: "BAD_REQUEST", message: `At most ${limit} ${isPhoto(input.mimeType) ? "photos" : "files"} can be attached` });
            }

            const storagePath = keyFor(ctx.organizationId, input);
            const [row] = await ctx.db
                .insert(attachments)
                .values({
                    id: input.id,
                    organizationId: ctx.organizationId,
                    subjectType: input.subjectType,
                    subjectId: input.subjectId,
                    fileName: input.fileName,
                    storagePath,
                    mimeType: input.mimeType,
                    sizeBytes: input.sizeBytes,
                    uploadedByUserId: ctx.session.userId,
                })
                .returning();
            if (!row) throw new Error("Insert returned no row");
            const upload = await ctx.storage.presignPut(storagePath, { mimeType: input.mimeType, sizeBytes: input.sizeBytes, expiresInSec: UPLOAD_URL_SECONDS });
            return { attachment: toDto(row), upload };
        }),

    /** The device says the bytes are up. The server checks storage before believing it. */
    confirm: orgProcedure.input(z.object({ id: EntityIdSchema })).mutation(async ({ ctx, input }) => {
        const [row] = await ctx.db.select().from(attachments).where(and(eq(attachments.id, input.id), eq(attachments.organizationId, ctx.organizationId))).limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
        const role = await authorize(ctx, row.subjectType, row.subjectId, "write");
        if (row.uploadedByUserId !== ctx.session.userId && !MANAGE_ROLES.includes(role)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Only the person who added a file can confirm it" });
        }
        if (row.status === "uploaded") return toDto(row);

        const stored = await ctx.storage.head(row.storagePath);
        if (!stored) throw new TRPCError({ code: "BAD_REQUEST", message: "The file hasn't finished uploading" });
        if (stored.sizeBytes !== row.sizeBytes) {
            await ctx.storage.delete(row.storagePath);
            await ctx.db.delete(attachments).where(eq(attachments.id, row.id));
            throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file doesn't match what was announced. Add it again." });
        }
        const [updated] = await ctx.db.update(attachments).set({ status: "uploaded" }).where(eq(attachments.id, row.id)).returning();
        return toDto(updated ?? row);
    }),

    /** Uploaded files for one thing, each with a short-lived download URL. */
    list: orgProcedure
        .input(z.object({ subjectType: AttachmentSubjectSchema, subjectId: EntityIdSchema }))
        .query(async ({ ctx, input }) => {
            await authorize(ctx, input.subjectType, input.subjectId, "read");
            const rows = await ctx.db
                .select()
                .from(attachments)
                .where(
                    and(
                        eq(attachments.organizationId, ctx.organizationId),
                        eq(attachments.subjectType, input.subjectType),
                        eq(attachments.subjectId, input.subjectId),
                        eq(attachments.status, "uploaded"),
                    ),
                )
                .orderBy(desc(attachments.uploadedAt));
            return Promise.all(rows.map(async (row) => ({ ...toDto(row), url: await ctx.storage.presignGet(row.storagePath, DOWNLOAD_URL_SECONDS) })));
        }),

    remove: orgProcedure.input(z.object({ id: EntityIdSchema })).mutation(async ({ ctx, input }) => {
        const [row] = await ctx.db.select().from(attachments).where(and(eq(attachments.id, input.id), eq(attachments.organizationId, ctx.organizationId))).limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
        const role = await authorize(ctx, row.subjectType, row.subjectId, "write");
        if (row.uploadedByUserId !== ctx.session.userId && !MANAGE_ROLES.includes(role)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Only the person who added a file, or an engineer, can remove it" });
        }
        await ctx.db.delete(attachments).where(eq(attachments.id, row.id));
        await ctx.storage.delete(row.storagePath).catch(() => undefined); // an orphaned object is harmless; a dangling row isn't
        return { ok: true as const };
    }),
});