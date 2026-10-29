// TEST_DATABASE_URL=postgresql://... pnpm --filter @majimap/api test

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
    assets,
    domainEvents,
    gisUserRoles,
    nodes,
    organization,
    organizationModules,
    schema,
    seedStructureAttachmentRules,
    structures,
    user,
    type Database,
} from "@majimap/db";
import { NodeSchema } from "@majimap/shared-types";
import { createCaller } from "../../router";
import type { Session } from "../../context";

// Integration tests against a real, migrated Postgres + PostGIS — the behaviour
// worth testing here (concurrent edits, branch overlays, the trigger backstop)
// can't be checked with mocks. Skipped unless TEST_DATABASE_URL is set.
const url = process.env.TEST_DATABASE_URL;

async function expectCode(promise: Promise<unknown>, code: TRPCError["code"]) {
    try {
        await promise;
    } catch (err) {
        assert.ok(err instanceof TRPCError, `expected a TRPCError but got: ${String(err)}`);
        assert.equal(err.code, code, `${err.code}: ${err.message}`);
        return;
    }
    assert.fail(`expected ${code} but the call succeeded`);
}

describe("gis.nodes", { skip: !url }, () => {
    const run = createId().slice(0, 8);
    const id = (name: string) => `${name}_${run}`;

    const orgA = id("orgA");
    const orgB = id("orgB");
    const orgC = id("orgC"); // GIS module switched off
    const users = {
        admin: id("uadmin"),
        tech: id("utech"),
        viewer: id("uviewer"),
        noRole: id("unorole"),
        outsider: id("uoutsider"),
        disabled: id("udisabled"),
    };
    const vaultA = id("vaultA");
    const vaultB = id("vaultB");

    let pool: Pool;
    let db: Database;

    const as = (userId: string, organizationId: string | null = orgA) => {
        const session: Session = { userId, organizationId };
        return createCaller({ db, session });
    };
    const admin = () => as(users.admin);
    const tech = () => as(users.tech);

    async function newValve(overrides: Partial<Parameters<ReturnType<typeof admin>["gis"]["nodes"]["create"]>[0]> = {}) {
        return admin().gis.nodes.create({
            type: "valve",
            name: `Valve ${createId().slice(0, 5)}`,
            location: { lat: -1.288, lng: 36.782 },
            condition: "good",
            isOpen: true,
            ...overrides,
        });
    }

    async function conditionEvents(assetId: string) {
        return db
            .select()
            .from(domainEvents)
            .where(and(eq(domainEvents.type, "asset.condition_changed"), sql`${domainEvents.payload}->>'assetId' = ${assetId}`));
    }

    before(async () => {
        pool = new Pool({ connectionString: url });
        db = drizzle(pool, { schema });

        await db.insert(organization).values([
            { id: orgA, name: "Org A", slug: orgA },
            { id: orgB, name: "Org B", slug: orgB },
            { id: orgC, name: "Org C", slug: orgC },
        ]);
        await db.insert(user).values(
            Object.entries(users).map(([key, userId]) => ({ id: userId, name: key, email: `${userId}@test.local` })),
        );
        await db.insert(organizationModules).values([
            { organizationId: orgA, moduleKey: "gis", enabled: true },
            { organizationId: orgB, moduleKey: "gis", enabled: true },
            { organizationId: orgC, moduleKey: "gis", enabled: false },
        ]);
        await db.insert(gisUserRoles).values([
            { organizationId: orgA, userId: users.admin, role: "admin" },
            { organizationId: orgA, userId: users.tech, role: "field_technician" },
            { organizationId: orgA, userId: users.viewer, role: "viewer" },
            { organizationId: orgB, userId: users.outsider, role: "admin" },
            { organizationId: orgC, userId: users.disabled, role: "admin" },
        ]);
        await seedStructureAttachmentRules(db);

        for (const [structureId, organizationId] of [[vaultA, orgA], [vaultB, orgB]] as const) {
            await db.insert(assets).values({ id: structureId, organizationId, ownerModule: "gis", label: "Vault", assetType: "structure" });
            await db.insert(structures).values({
                id: structureId,
                organizationId,
                createdByUserId: users.admin,
                type: "vault",
                name: "Vault",
                location: { lat: -1.29, lng: 36.78 },
            });
        }
    });

    after(async () => {
        await pool.end();
    });

    describe("access control", () => {
        it("rejects callers who aren't signed in", async () => {
            await expectCode(createCaller({ db, session: null }).gis.nodes.list(), "UNAUTHORIZED");
        });

        it("rejects callers with no active organization", async () => {
            await expectCode(as(users.admin, null).gis.nodes.list(), "FORBIDDEN");
        });

        it("rejects organizations that haven't enabled the GIS module", async () => {
            await expectCode(as(users.disabled, orgC).gis.nodes.list(), "FORBIDDEN");
        });

        it("rejects members who hold no GIS role", async () => {
            await expectCode(as(users.noRole).gis.nodes.list(), "FORBIDDEN");
        });

        it("lets a viewer read but not write", async () => {
            const viewer = as(users.viewer);
            await viewer.gis.nodes.list();
            await expectCode(
                viewer.gis.nodes.create({ type: "junction", name: "Nope", location: { lat: 0, lng: 0 } }),
                "FORBIDDEN",
            );
        });

        it("lets a technician edit but not delete", async () => {
            const node = await newValve();
            await expectCode(tech().gis.nodes.delete({ id: node.id, baseVersionId: node.versionId }), "FORBIDDEN");
            const updated = await tech().gis.nodes.update({ id: node.id, baseVersionId: node.versionId, patch: { name: "Renamed by tech" } });
            assert.equal(updated.name, "Renamed by tech");
        });
    });

    describe("creating and reading", () => {
        it("round-trips geometry and dates, and matches the shape the frontends already use", async () => {
            const node = await newValve({ installedAt: "2024-01-15T10:00:00.000Z" });
            assert.deepEqual(node.location, { lat: -1.288, lng: 36.782 });
            assert.equal(node.installedAt, "2024-01-15T10:00:00.000Z");
            assert.equal(node.lastInspectedAt, null);
            assert.equal(node.branch, "main");

            const parsed = NodeSchema.parse(node);
            assert.equal(parsed.id, node.id);

            const fetched = await admin().gis.nodes.byId({ id: node.id });
            assert.deepEqual(fetched, node);
            assert.ok((await admin().gis.nodes.list()).some((n) => n.id === node.id));
        });

        it("only lets valves carry an open/closed state", async () => {
            await expectCode(newValve({ type: "hydrant", isOpen: true }), "BAD_REQUEST");
            const hydrant = await newValve({ type: "hydrant", isOpen: null });
            await expectCode(
                admin().gis.nodes.update({ id: hydrant.id, baseVersionId: hydrant.versionId, patch: { isOpen: false } }),
                "BAD_REQUEST",
            );
        });

        it("treats a retried create with the same id as a no-op, not a duplicate", async () => {
            const clientId = id("offline");
            const first = await newValve({ id: clientId });
            const retry = await newValve({ id: clientId });
            assert.equal(retry.versionId, first.versionId);
            const history = await admin().gis.nodes.history({ id: clientId });
            assert.equal(history.length, 1);
        });
    });

    describe("versioned edits on main", () => {
        it("supersedes the old version instead of overwriting it", async () => {
            const v1 = await newValve({ name: "Original" });
            const v2 = await admin().gis.nodes.update({ id: v1.id, baseVersionId: v1.versionId, patch: { name: "Edited" } });
            assert.notEqual(v2.versionId, v1.versionId);

            const history = await admin().gis.nodes.history({ id: v1.id });
            assert.equal(history.length, 2);
            assert.deepEqual(
                history.map((h) => [h.name, h.isHead]),
                [["Edited", true], ["Original", false]],
            );
            assert.equal(history[0]?.supersedesVersionId, v1.versionId);

            const [asset] = await db.select().from(assets).where(eq(assets.id, v1.id));
            assert.equal(asset?.label, "Edited", "the asset registry follows main");
        });

        it("rejects an edit based on a stale version", async () => {
            const v1 = await newValve();
            await admin().gis.nodes.update({ id: v1.id, baseVersionId: v1.versionId, patch: { name: "First" } });
            await expectCode(
                admin().gis.nodes.update({ id: v1.id, baseVersionId: v1.versionId, patch: { name: "Second, stale" } }),
                "CONFLICT",
            );
        });

        it("emits a domain event when condition changes on main, and only then", async () => {
            const v1 = await newValve({ condition: "good" });
            const v2 = await admin().gis.nodes.update({ id: v1.id, baseVersionId: v1.versionId, patch: { name: "Just a rename" } });
            assert.equal((await conditionEvents(v1.id)).length, 0);

            const v3 = await admin().gis.nodes.update({ id: v1.id, baseVersionId: v2.versionId, patch: { condition: "critical" } });
            const events = await conditionEvents(v1.id);
            assert.equal(events.length, 1);
            assert.deepEqual(events[0]?.payload, { assetId: v1.id, from: "good", to: "critical", changedByUserId: users.admin });

            await admin().gis.nodes.update({ id: v1.id, baseVersionId: v3.versionId, patch: { condition: "critical", name: "Same condition again" } });
            assert.equal((await conditionEvents(v1.id)).length, 1, "no change in condition, no event");
        });

        it("hides a deleted node and refuses further edits", async () => {
            const node = await newValve();
            await admin().gis.nodes.delete({ id: node.id, baseVersionId: node.versionId });
            assert.ok(!(await admin().gis.nodes.list()).some((n) => n.id === node.id));
            await expectCode(admin().gis.nodes.byId({ id: node.id }), "NOT_FOUND");
            const history = await admin().gis.nodes.history({ id: node.id });
            assert.equal(history.length, 2, "deleting adds a tombstone version, it doesn't erase history");
            await expectCode(
                admin().gis.nodes.update({ id: node.id, baseVersionId: history[0]!.versionId, patch: { name: "Zombie" } }),
                "NOT_FOUND",
            );
        });
    });

    describe("branches", () => {
        it("keeps a branch edit off main until it's reconciled", async () => {
            const onMain = await newValve({ name: "On main", condition: "good" });
            const onBranch = await admin().gis.nodes.update({
                id: onMain.id,
                baseVersionId: onMain.versionId,
                branch: "field-visit",
                patch: { name: "Edited on branch", condition: "poor" },
            });
            assert.equal(onBranch.branch, "field-visit");

            const mainView = await admin().gis.nodes.byId({ id: onMain.id });
            assert.equal(mainView.name, "On main");
            assert.equal(mainView.versionId, onMain.versionId);

            const branchView = await admin().gis.nodes.byId({ id: onMain.id, branch: "field-visit" });
            assert.equal(branchView.name, "Edited on branch");

            const [mainHead] = await db.select().from(nodes).where(and(eq(nodes.versionId, onMain.versionId)));
            assert.equal(mainHead?.isHead, true, "main's head row is untouched by the branch edit");

            const [asset] = await db.select().from(assets).where(eq(assets.id, onMain.id));
            assert.equal(asset?.label, "On main", "the shared asset registry isn't touched by a branch");
            assert.equal((await conditionEvents(onMain.id)).length, 0, "an unreconciled edit isn't a fact other modules should react to");
        });

        it("shows main's entities through the branch overlay, with the branch's own on top", async () => {
            const a = await newValve({ name: "Overlay A" });
            const b = await newValve({ name: "Overlay B" });
            await admin().gis.nodes.update({ id: a.id, baseVersionId: a.versionId, branch: "overlay", patch: { name: "A (branch)" } });

            const view = await admin().gis.nodes.list({ branch: "overlay" });
            assert.equal(view.find((n) => n.id === a.id)?.name, "A (branch)");
            assert.equal(view.find((n) => n.id === b.id)?.name, "Overlay B", "untouched entities fall through to main");
            assert.equal(view.filter((n) => n.id === a.id).length, 1, "no duplicate for an edited entity");
        });

        it("prefers the branch's version no matter which row was written last", async () => {
            const v1 = await newValve({ name: "Order base" });
            await admin().gis.nodes.update({ id: v1.id, baseVersionId: v1.versionId, branch: "overlay-order", patch: { name: "Order (branch)" } });
            // main moves on AFTER the branch edit, so main's head is the more recently written row —
            // an implementation that merely takes "the last row" would show main's version here
            await admin().gis.nodes.update({ id: v1.id, baseVersionId: v1.versionId, patch: { condition: "fair" } });

            const view = await admin().gis.nodes.list({ branch: "overlay-order" });
            assert.equal(view.find((n) => n.id === v1.id)?.name, "Order (branch)");
            assert.equal((await admin().gis.nodes.byId({ id: v1.id, branch: "overlay-order" })).name, "Order (branch)");
        });

        it("builds a branch's first edit from the version the client edited, not main's newer one", async () => {
            const v1 = await newValve({ name: "Base", condition: "good" });
            // main moves on while the (offline) client is still looking at v1
            await admin().gis.nodes.update({ id: v1.id, baseVersionId: v1.versionId, patch: { condition: "fair" } });
            const branchRow = await admin().gis.nodes.update({
                id: v1.id,
                baseVersionId: v1.versionId,
                branch: "stale-client",
                patch: { name: "Client's change" },
            });
            assert.equal(branchRow.name, "Client's change");
            assert.equal(branchRow.condition, "good", "branch = base + only the client's own change");
            const history = await admin().gis.nodes.history({ id: v1.id });
            assert.equal(history.find((h) => h.branch === "stale-client")?.supersedesVersionId, v1.versionId);
        });

        it("treats a second edit on the same branch as stale if it isn't based on the branch's head", async () => {
            const v1 = await newValve();
            const b1 = await admin().gis.nodes.update({ id: v1.id, baseVersionId: v1.versionId, branch: "twice", patch: { name: "One" } });
            await expectCode(
                admin().gis.nodes.update({ id: v1.id, baseVersionId: v1.versionId, branch: "twice", patch: { name: "Two, stale" } }),
                "CONFLICT",
            );
            const b2 = await admin().gis.nodes.update({ id: v1.id, baseVersionId: b1.versionId, branch: "twice", patch: { name: "Two" } });
            assert.equal(b2.name, "Two");
        });

        it("lets a branch hide a node without deleting it from main", async () => {
            const node = await newValve();
            await admin().gis.nodes.delete({ id: node.id, baseVersionId: node.versionId, branch: "cleanup" });
            assert.ok(!(await admin().gis.nodes.list({ branch: "cleanup" })).some((n) => n.id === node.id));
            assert.ok((await admin().gis.nodes.list()).some((n) => n.id === node.id));
        });
    });

    describe("concurrency", () => {
        it("lets edits to different nodes proceed in parallel", async () => {
            const [a, b, c, d] = await Promise.all([newValve(), newValve(), newValve(), newValve()]);
            const results = await Promise.all(
                [a, b, c, d].map((n) => admin().gis.nodes.update({ id: n.id, baseVersionId: n.versionId, patch: { name: `Parallel ${n.id}` } })),
            );
            assert.equal(results.length, 4);
        });

        it("lets exactly one of two racing edits to the same node win", async () => {
            const node = await newValve();
            const results = await Promise.allSettled([
                admin().gis.nodes.update({ id: node.id, baseVersionId: node.versionId, patch: { name: "Racer 1" } }),
                tech().gis.nodes.update({ id: node.id, baseVersionId: node.versionId, patch: { name: "Racer 2" } }),
            ]);
            const won = results.filter((r) => r.status === "fulfilled");
            const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
            assert.equal(won.length, 1);
            assert.equal(lost.length, 1);
            assert.ok(lost[0]!.reason instanceof TRPCError && lost[0]!.reason.code === "CONFLICT");

            const history = await admin().gis.nodes.history({ id: node.id });
            assert.equal(history.filter((h) => h.isHead && h.branch === "main").length, 1, "exactly one head survives");
        });

        it("lets exactly one of two racing first-edits on a branch win", async () => {
            const node = await newValve();
            const results = await Promise.allSettled([
                admin().gis.nodes.update({ id: node.id, baseVersionId: node.versionId, branch: "race", patch: { name: "R1" } }),
                tech().gis.nodes.update({ id: node.id, baseVersionId: node.versionId, branch: "race", patch: { name: "R2" } }),
            ]);
            assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
            const lost = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
            assert.ok(lost?.reason instanceof TRPCError && lost.reason.code === "CONFLICT");
        });
    });

    describe("structures", () => {
        it("accepts an allowed pairing and rejects a disallowed one", async () => {
            const housed = await newValve({ structureId: vaultA });
            assert.equal(housed.structureId, vaultA);
            await expectCode(newValve({ type: "hydrant", isOpen: null, structureId: vaultA }), "BAD_REQUEST");
        });

        it("refuses a structure that belongs to another organization", async () => {
            await expectCode(newValve({ structureId: vaultB }), "BAD_REQUEST");
        });

        it("is backed by a database trigger that holds even if the API is bypassed", async () => {
            const hydrantId = id("directhyd");
            await db.insert(assets).values({ id: hydrantId, organizationId: orgA, ownerModule: "gis", label: "H", assetType: "hydrant" });
            await assert.rejects(
                db.insert(nodes).values({
                    id: hydrantId,
                    organizationId: orgA,
                    createdByUserId: users.admin,
                    type: "hydrant",
                    name: "H",
                    location: { lat: 0, lng: 0 },
                    structureId: vaultA,
                }),
                (err: unknown) => JSON.stringify(err, Object.getOwnPropertyNames(err)).includes("may not be housed"),
            );

            const valveId = id("directvalve");
            await db.insert(assets).values({ id: valveId, organizationId: orgA, ownerModule: "gis", label: "V", assetType: "valve" });
            await assert.rejects(
                db.insert(nodes).values({
                    id: valveId,
                    organizationId: orgA,
                    createdByUserId: users.admin,
                    type: "valve",
                    name: "V",
                    location: { lat: 0, lng: 0 },
                    structureId: vaultB,
                }),
                (err: unknown) => JSON.stringify(err, Object.getOwnPropertyNames(err)).includes("existing structure in this organization"),
            );
        });
    });

    describe("tenant isolation", () => {
        it("never shows one organization's nodes to another", async () => {
            const mine = await newValve();
            const outsider = as(users.outsider, orgB);
            assert.ok(!(await outsider.gis.nodes.list()).some((n) => n.id === mine.id));
            await expectCode(outsider.gis.nodes.byId({ id: mine.id }), "NOT_FOUND");
            await expectCode(outsider.gis.nodes.history({ id: mine.id }), "NOT_FOUND");
        });

        it("won't let another organization edit, delete or claim a node's id", async () => {
            const mine = await newValve();
            const outsider = as(users.outsider, orgB);
            await expectCode(outsider.gis.nodes.update({ id: mine.id, baseVersionId: mine.versionId, patch: { name: "Hijacked" } }), "NOT_FOUND");
            await expectCode(outsider.gis.nodes.delete({ id: mine.id, baseVersionId: mine.versionId }), "NOT_FOUND");
            await expectCode(
                outsider.gis.nodes.create({ id: mine.id, type: "junction", name: "Squatter", location: { lat: 0, lng: 0 } }),
                "CONFLICT",
            );
            assert.equal((await admin().gis.nodes.byId({ id: mine.id })).name, mine.name);
        });
    });
});