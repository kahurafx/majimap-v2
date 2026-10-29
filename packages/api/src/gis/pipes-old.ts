import {ConditionSchema, Pipe, PipeSchema} from "@majimap/shared-types";
import {assets, Database, domainEvents, nodes, pipes} from "@majimap/db";
import {BranchSchema, compact, EntityIdSchema, GeoPointInput, MAIN_BRANCH, rethrowDbError, toIso} from "./versioning";
import {z} from "zod";
import {and, desc, eq, inArray, sql} from "drizzle-orm";
import {TRPCError} from "@trpc/server";
import {gisProcedure, gisRoleProcedure, router} from "../trpc";
import {createId} from "@paralleldrive/cuid2";

type PipeRow = typeof pipes.$inferSelect
type PipeInsert = typeof pipes.$inferInsert

/** The shared-types shape the frontends already consume, plus which version/branch this is. */
export type PipeDto = Pipe & { versionId: string, branch: string }

export function toPipeDto(row: PipeRow): PipeDto {
    return {
        id: row.id,
        versionId: row.versionId,
        branch: row.branch,
        fromNodeId: row.fromNodeId,
        toNodeId: row.toNodeId,
        path: row.path,
        material: row.material,
        diameterMm: row.diameterMm,
        lengthM: row.lengthM,
        condition: row.condition,
    }
}

const WRITE_ROLES = ["admin", "gis_engineer", "field_technician"] as const;
const DELETE_ROLES = ["admin", "gis_engineer"] as const;

const PipeMaterialSchema = PipeSchema.shape.material;
const PipePathSchema = z.array(GeoPointInput).min(2, "A pipe path requires at least 2 points");

const PipePatchSchema = z
    .object({
        fromNodeId: EntityIdSchema,
        toNodeId: EntityIdSchema,
        path: PipePathSchema,
        material: PipeMaterialSchema,
        diameterMm: z.number().positive(),
        condition: ConditionSchema,
        lengthM: z.number().positive(),
    })
    .partial()
    .refine((patch) => Object.values(patch).some((v) => v !== undefined, "Patch is empty"))

/**
 * Loads the effective head row for a pipe on a given branch (branch head if
 * present, falling back to main's head).
 */
async function loadEffectivePipe(
    db: Database,
    orgId: string,
    id: string,
    branch: string,
): Promise<PipeRow | undefined> {
    const [row] = await db
        .select()
        .from(pipes)
        .where(
            and(
                eq(pipes.organizationId, orgId),
                eq(pipes.id, id),
                eq(pipes.isHead, true),
                inArray(pipes.branch, [MAIN_BRANCH, branch]),
            ),
        )
        .orderBy(sql`(${pipes.branch} = ${branch})
                     desc`)
        .limit(1);
    return row;
}

async function assertEndpointsExist(
    db: Database,
    orgId: string,
    branch: string,
    fromNodeId: string,
    toNodeId: string
) {
    if (fromNodeId === toNodeId) {
        throw new TRPCError({code: "BAD_REQUEST", message: "A pipe cannot connect a node to itself"});
    }

    // Fetch both nodes simultaneously to ensure they exist on this branch or main
    const rows = await db
        .select({id: nodes.id})
        .from(nodes)
        .where(
            and(
                eq(nodes.organizationId, orgId),
                inArray(nodes.id, [fromNodeId, toNodeId]),
                eq(nodes.isHead, true),
                eq(nodes.isDeleted, false),
                inArray(nodes.branch, [MAIN_BRANCH, branch])
            )
        );

    // Because of branch overlays, the query might return up to 4 rows (main + branch versions).
    // We just need to verify that BOTH unique IDs came back.
    const foundIds = new Set(rows.map((r) => r.id));
    if (!foundIds.has(fromNodeId)) {
        throw new TRPCError({code: "BAD_REQUEST", message: `Start node ${fromNodeId} not found or deleted`});
    }
    if (!foundIds.has(toNodeId)) {
        throw new TRPCError({code: "BAD_REQUEST", message: `End node ${toNodeId} not found or deleted`});
    }
}

/**
 * The versioned write. Never updates a row's data in place — it supersedes it.
 *
 * - Branch already has a head for this entity: the edit must be based on
 *   that head (otherwise it's stale — someone else edited this branch). The
 *   head is flipped with a compare-and-set UPDATE, so of two racing edits
 *   exactly one flips it and the other sees zero rows and gets CONFLICT.
 * - Branch has no head yet (first edit on a feature branch): the new row is
 *   built from `baseVersionId` — the version the client actually edited —
 *   NOT from main's current head, and main's row is left untouched. Keeping
 *   branch = base + exactly-the-client's-changes is what lets reconcile
 *   later tell the branch's changes apart from main's concurrent ones.
 */

type EditArgs = {
    orgId: string;
    userId: string;
    id: string;
    branch: string;
    baseVersionId: string;
    patch: Partial<PipeInsert>;
    tombstone: boolean;
};

async function editPipe(db: Database, args: EditArgs): Promise<{ previous: PipeRow; next: PipeRow }> {

    const {orgId, userId, id, branch, baseVersionId, patch, tombstone} = args;

    const [branchHead] = await db
        .select()
        .from(pipes)
        .where(
            and(
                eq(pipes.organizationId, orgId),
                eq(pipes.id, id),
                eq(pipes.branch, branch),
                eq(pipes.isHead, true)
            ))
        .limit(1);

    let previous: PipeRow;

    if (branchHead) {
        if (branchHead.isDeleted) throw new TRPCError({code: "NOT_FOUND", message: "Node not found"});
        if (branchHead.versionId !== baseVersionId) {
            throw new TRPCError({
                code: "CONFLICT",
                message: "This node changed since you loaded it — refetch and reapply your edit",
            });
        }

        const flipped = await db
            .update(pipes)
            .set({isHead: false})
            .where(and(
                eq(pipes.versionId, branchHead.versionId),
                eq(pipes.isHead, true)
            ))
            .returning({versionId: pipes.versionId});

        if (flipped.length === 0) {
            throw new TRPCError({code: "CONFLICT", message: "This node was changed concurrently — refetch and retry"});
        }
        previous = branchHead;

    } else if (branch === MAIN_BRANCH) {
        // No head on main. Either it never existed, or a concurrent edit just superseded
        // the head we expected — those need different answers.
        const [anyVersion] = await db
            .select({versionId: pipes.versionId})
            .from(pipes)
            .where(and(
                eq(pipes.organizationId, orgId),
                eq(pipes.id, id),
                eq(pipes.branch, MAIN_BRANCH))
            )
            .limit(1);

        throw anyVersion
            ? new TRPCError({code: "CONFLICT", message: "This node was changed concurrently — refetch and retry"})
            : new TRPCError({code: "NOT_FOUND", message: "Node not found"});

    } else {
        const [base] = await db
            .select()
            .from(pipes)
            .where(and(eq(pipes.organizationId, orgId), eq(pipes.id, id), eq(pipes.versionId, baseVersionId)))
            .limit(1);

        if (!base) throw new TRPCError({code: "NOT_FOUND", message: "Node not found"});
        if (base.isDeleted) throw new TRPCError({code: "NOT_FOUND", message: "Node not found"});
        previous = base;

    }

    const {versionId: _versionId, createdAt: _createdAt, ...carried} = previous;
    const [next] = await db
        .insert(pipes)
        .values({
            ...carried,
            ...patch,
            versionId: createId(),
            branch,
            isHead: true,
            isDeleted: tombstone,
            supersedesVersionId: previous.versionId,
            createdByUserId: userId,
        })
        .returning();
    if (!next) throw new Error("Insert returned no row");

    return {previous, next};
}

export const pipesRouter = router({
    list: gisProcedure
        .input(z.object({
            branch: BranchSchema.default(MAIN_BRANCH),
        }).optional())
        .query(async ({ctx, input}) => {
            const branch = input?.branch ?? MAIN_BRANCH;
            const rows = await ctx.db
                .selectDistinctOn([pipes.id])
                .from(pipes)
                .where(
                    and(
                        eq(pipes.organizationId, ctx.organizationId),
                        eq(pipes.isHead, true),
                        inArray(nodes.branch, [MAIN_BRANCH, branch])
                    )
                )
                .orderBy(
                    pipes.id, sql`(${nodes.branch} = ${branch}) desc`
                );

            return rows.filter((row) => !row.isDeleted).map(toPipeDto)
        }),
    byId: gisProcedure
        .input(z.object({id: EntityIdSchema, branch: BranchSchema.default(MAIN_BRANCH)}))
        .query(async ({ctx, input}) => {
            const row = await loadEffectivePipe(ctx.db, ctx.organizationId, input.id, input.branch);
            if (!row || row.isDeleted) throw new TRPCError({code: "NOT_FOUND", message: "Pipe not found"});

            return toPipeDto(row)
        }),

    /** Every version of one node, newest first, across all branches — the audit trail the version chain gives for free. */
    history: gisProcedure.input(z.object({id: EntityIdSchema})).query(async ({ctx, input}) => {
        const rows = await ctx.db
            .select()
            .from(pipes)
            .where(and(eq(pipes.organizationId, ctx.organizationId), eq(pipes.id, input.id)))
            .orderBy(desc(pipes.createdAt));
        if (rows.length === 0) throw new TRPCError({code: "NOT_FOUND", message: "Node not found"});

        return rows.map((row) => ({
            versionId: row.versionId,
            branch: row.branch,
            isHead: row.isHead,
            isDeleted: row.isDeleted,
            fromNodeId: row.fromNodeId,
            toNodeId: row.toNodeId,
            path: row.path,
            material: row.material,
            diameter: row.diameterMm,
            length: row.lengthM,
            supersedesVersionId: row.supersedesVersionId,
            createdAt: row.createdAt.toISOString(),
            createdByUserId: row.createdByUserId,
            condition: row.condition,
        }));
    }),

    create: gisRoleProcedure(...WRITE_ROLES)
        .input(
            z.object({
                id: EntityIdSchema.optional(),
                branch: BranchSchema.default(MAIN_BRANCH),
                fromNodeId: EntityIdSchema,
                toNodeId: EntityIdSchema,
                path: PipePathSchema,
                material: PipeMaterialSchema.default("unknown"),
                diameterMm: z.number().positive(),
                condition: ConditionSchema.default("unknown"),
                lengthM: z.number().positive(),
            })
        )
        .mutation(async ({ctx, input}) => {
            try {
                return await ctx.db.transaction(async (tx) => {
                    const id = input.id ?? createId();

                    // 1. Offline Retry Check
                    const [existing] = await tx
                        .select({organizationId: assets.organizationId})
                        .from(assets)
                        .where(eq(assets.id, id))
                        .limit(1);

                    if (existing) {
                        if (existing.organizationId === ctx.organizationId) {
                            const [head] = await tx
                                .select()
                                .from(pipes)
                                .where(
                                    and(
                                        eq(pipes.organizationId, ctx.organizationId),
                                        eq(pipes.id, id),
                                        eq(pipes.branch, input.branch),
                                        eq(pipes.isHead, true)
                                    )
                                )
                                .limit(1);
                            if (head && !head.isDeleted) return toPipeDto(head);
                        }
                        throw new TRPCError({code: "CONFLICT", message: "That id is already in use"});
                    }

                    // 2. The Relationship Guardrail!
                    await assertEndpointsExist(tx, ctx.organizationId, input.branch, input.fromNodeId, input.toNodeId);

                    // 3. Insert into the shared registry
                    await tx.insert(assets).values({
                        id,
                        organizationId: ctx.organizationId,
                        ownerModule: "gis",
                        label: `${input.material} ${input.diameterMm}mm`,
                        assetType: "pipe",
                    });

                    // 4. Insert the actual time-travel version row
                    const [row] = await tx
                        .insert(pipes)
                        .values({
                            id,
                            organizationId: ctx.organizationId,
                            branch: input.branch,
                            createdByUserId: ctx.session.userId,
                            fromNodeId: input.fromNodeId,
                            toNodeId: input.toNodeId,
                            path: input.path,
                            material: input.material,
                            diameterMm: input.diameterMm,
                            condition: input.condition,
                            lengthM: input.lengthM,
                        })
                        .returning();

                    if (!row) throw new Error("Insert returned no row");
                    return toPipeDto(row);
                });
            } catch (err) {
                rethrowDbError(err);
            }
        }),
    update: gisRoleProcedure(...WRITE_ROLES)
        .input(
            z.object({
                id: EntityIdSchema,
                baseVersionId: z.string().min(1),
                branch: BranchSchema.default(MAIN_BRANCH),
                patch: PipePatchSchema
            })
        )
        .mutation(async ({ctx, input}) => {
            const {patch} = input
            try {
                return await ctx.db.transaction(async (tx) => {
                    const {previous, next} = await editPipe(tx, {
                        orgId: ctx.organizationId,
                        userId: ctx.session.userId,
                        id: input.id,
                        branch: input.branch,
                        baseVersionId: input.baseVersionId,
                        tombstone: false,
                        patch: compact({
                            fromNodeId: patch.fromNodeId,
                            toNodeId: patch.toNodeId,
                            path: patch.path,
                            material: patch.material,
                            diameterMm: patch.diameterMm,
                            condition: patch.condition,
                            lengthM: patch.lengthM,
                        }),
                    })

                    if (patch.fromNodeId || patch.toNodeId) {
                        await assertEndpointsExist(
                            tx,
                            ctx.organizationId,
                            input.branch,
                            next.fromNodeId,
                            next.toNodeId
                        );
                    }

                    // The shared asset registry is NOT versioned, so a branch's rename or move must
                    // not touch it — that would leak an unreconciled edit into everyone's view.
                    if (input.branch === MAIN_BRANCH) {
                        await tx
                            .update(assets)
                            .set({
                                label: `${next.material} ${next.diameterMm}mm`,
                            })
                            .where(eq(assets.id, next.id));
                    }

                    // Only edits that land on main are facts other modules should react to; a
                    // branch edit is still a proposal until it's reconciled.
                    if (input.branch === MAIN_BRANCH && patch.condition !== undefined && patch.condition !== previous.condition) {
                        await tx.insert(domainEvents).values({
                            organizationId: ctx.organizationId,
                            type: "asset.condition_changed",
                            sourceModule: "gis",
                            payload: {
                                assetId: next.id,
                                from: previous.condition,
                                to: next.condition,
                                changedByUserId: ctx.session.userId,
                            },
                        });
                    }
                    return toPipeDto(next)
                })
            } catch (e) {
                rethrowDbError(e)
            }
        }),
    delete: gisRoleProcedure(...DELETE_ROLES)
        .input(z.object({
            id: EntityIdSchema,
            baseVersionId: z.string().min(1),
            branch: BranchSchema.default(MAIN_BRANCH)
        }))
        .mutation(async ({ctx, input}) => {
            try {
                await ctx.db.transaction(async (tx) => {
                    await editPipe(tx, {
                        orgId: ctx.organizationId,
                        userId: ctx.session.userId,
                        id: input.id,
                        branch: input.branch,
                        baseVersionId: input.baseVersionId,
                        tombstone: true,
                        patch: {},
                    });
                });
                return {ok: true as const};
            } catch (err) {
                rethrowDbError(err);
            }
        }),
})