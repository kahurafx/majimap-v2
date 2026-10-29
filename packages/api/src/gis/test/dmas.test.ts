import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { assets, tiers } from "@majimap/db";
import { DmaSchema } from "@majimap/shared-types";
import { expectCode, setupTestEnv, type TestEnv } from "./test-support";

// Integration tests against a real, migrated Postgres + PostGIS. Skipped unless
// TEST_DATABASE_URL is set; creates uniquely named data and never cleans it up,
// so point it at a throwaway database.
const url = process.env.TEST_DATABASE_URL;

const P = (lat: number, lng: number) => ({ lat, lng });
/** A 0.01° square, left open: the server closes it. */
const RING = [P(-1.29, 36.78), P(-1.29, 36.79), P(-1.3, 36.79), P(-1.3, 36.78)];

describe("gis.dmas", { skip: !url }, () => {
    let env: TestEnv;
    let tierA: string;
    let tierB: string;

    before(async () => {
        env = await setupTestEnv();
        const [a] = await env.db.insert(tiers).values({ organizationId: env.orgA, name: "DMA tier", order: 1 }).returning({ id: tiers.id });
        const [b] = await env.db.insert(tiers).values({ organizationId: env.orgB, name: "DMA tier", order: 1 }).returning({ id: tiers.id });
        if (!a || !b) throw new Error("tier setup failed");
        tierA = a.id;
        tierB = b.id;
    });
    after(async () => {
        await env.close();
    });

    const admin = () => env.admin();
    const tech = () => env.tech();
    const shortId = () => Math.random().toString(36).slice(2, 7);

    type NodeInput = Parameters<ReturnType<TestEnv["admin"]>["gis"]["nodes"]["create"]>[0];
    const newMeter = (overrides: Partial<NodeInput> = {}) =>
        admin().gis.nodes.create({ type: "meter", name: `Meter ${shortId()}`, location: P(-1.295, 36.785), ...overrides });
    const newValve = (overrides: Partial<NodeInput> = {}) =>
        admin().gis.nodes.create({ type: "valve", name: `Valve ${shortId()}`, location: P(-1.29, 36.785), isOpen: true, ...overrides });
    const newJunction = () => admin().gis.nodes.create({ type: "junction", name: `Junction ${shortId()}`, location: P(-1.29, 36.78) });

    type DmaInput = Parameters<ReturnType<TestEnv["admin"]>["gis"]["dmas"]["create"]>[0];
    /** Creates its own inlet meter unless you pass one. */
    async function newDma(overrides: Partial<DmaInput> = {}) {
        const inletMeterId = overrides.inletMeterId ?? (await newMeter()).id;
        return admin().gis.dmas.create({
            name: `DMA ${shortId()}`,
            color: "#3B82F6",
            tierId: tierA,
            inletMeterId,
            boundaryValveIds: [],
            ring: RING,
            ...overrides,
        });
    }

    describe("access control", () => {
        it("rejects callers who aren't signed in", async () => {
            await expectCode(env.anonymous().gis.dmas.list(), "UNAUTHORIZED");
        });

        it("lets a viewer read but not write", async () => {
            const meter = await newMeter();
            await env.viewer().gis.dmas.list();
            await expectCode(
                env.viewer().gis.dmas.create({ name: "Nope", color: "#112233", tierId: tierA, inletMeterId: meter.id, ring: RING }),
                "FORBIDDEN",
            );
        });

        it("lets a technician create and edit but not delete", async () => {
            const meter = await newMeter();
            const dma = await tech().gis.dmas.create({ name: "Tech DMA", color: "#112233", tierId: tierA, inletMeterId: meter.id, ring: RING });
            await expectCode(tech().gis.dmas.delete({ id: dma.id, baseVersionId: dma.versionId }), "FORBIDDEN");
            const renamed = await tech().gis.dmas.update({ id: dma.id, baseVersionId: dma.versionId, patch: { name: "Renamed" } });
            assert.equal(renamed.name, "Renamed");
        });
    });

    describe("creating and reading", () => {
        it("round-trips in the shape the frontends already use, with the valves sorted and the ring closed", async () => {
            const v1 = await newValve();
            const v2 = await newValve();
            const dma = await newDma({ boundaryValveIds: [v2.id, v1.id] });

            assert.deepEqual(dma.boundaryValveIds, [v1.id, v2.id].sort());
            assert.equal(dma.ring.length, 5, "four corners, closed by the server");
            assert.deepEqual(dma.ring.slice(0, 4), RING);
            assert.deepEqual(dma.ring[0], dma.ring[4]);
            assert.equal(dma.branch, "main");
            assert.equal(DmaSchema.parse(dma).id, dma.id);

            assert.deepEqual(await admin().gis.dmas.byId({ id: dma.id }), dma);
            assert.ok((await admin().gis.dmas.list()).some((d) => d.id === dma.id));
        });

        it("collapses a repeated valve id instead of failing on it", async () => {
            const v = await newValve();
            const dma = await newDma({ boundaryValveIds: [v.id, v.id] });
            assert.deepEqual(dma.boundaryValveIds, [v.id]);
        });

        it("keeps the registry label in step and records what it is", async () => {
            const dma = await newDma({ name: "Registry DMA" });
            const [asset] = await env.db.select().from(assets).where(eq(assets.id, dma.id));
            assert.equal(asset?.label, "Registry DMA");
            assert.equal(asset?.assetType, "dma");
        });

        it("treats a retried create with the same id as a no-op, not a duplicate", async () => {
            const meter = await newMeter();
            const valve = await newValve();
            const clientId = env.id("offlinedma");
            const first = await newDma({ id: clientId, inletMeterId: meter.id, boundaryValveIds: [valve.id] });
            const retry = await newDma({ id: clientId, inletMeterId: meter.id, boundaryValveIds: [valve.id] });
            assert.equal(retry.versionId, first.versionId);
            assert.deepEqual(retry.boundaryValveIds, [valve.id]);
            assert.equal((await admin().gis.dmas.history({ id: clientId })).length, 1);
        });
    });

    describe("rejecting bad DMAs", () => {
        it("needs a tier that exists", async () => {
            await expectCode(newDma({ tierId: env.id("ghosttier") }), "BAD_REQUEST");
        });

        it("won't use another organization's tier", async () => {
            await expectCode(newDma({ tierId: tierB }), "BAD_REQUEST");
        });

        it("needs the inlet to be a meter", async () => {
            const junction = await newJunction();
            await expectCode(newDma({ inletMeterId: junction.id }), "BAD_REQUEST");
        });

        it("needs the inlet to exist", async () => {
            await expectCode(newDma({ inletMeterId: env.id("ghostmeter") }), "BAD_REQUEST");
        });

        it("needs every boundary valve to be a valve", async () => {
            const junction = await newJunction();
            await expectCode(newDma({ boundaryValveIds: [junction.id] }), "BAD_REQUEST");
        });

        it("needs every boundary valve to exist", async () => {
            await expectCode(newDma({ boundaryValveIds: [env.id("ghostvalve")] }), "BAD_REQUEST");
        });

        it("won't use another organization's valve", async () => {
            const theirs = await env.outsider().gis.nodes.create({ type: "valve", name: "Theirs", location: P(0, 0), isOpen: true });
            await expectCode(newDma({ boundaryValveIds: [theirs.id] }), "BAD_REQUEST");
        });

        it("needs a boundary that encloses some area", async () => {
            const line = [P(-1.29, 36.78), P(-1.3, 36.78), P(-1.31, 36.78)];
            await expectCode(newDma({ ring: line }), "BAD_REQUEST");
        });

        it("needs at least three corners", async () => {
            await expectCode(newDma({ ring: [P(-1.29, 36.78), P(-1.3, 36.78)] }), "BAD_REQUEST");
        });

        it("needs a real hex colour and a name", async () => {
            await expectCode(newDma({ color: "blue" }), "BAD_REQUEST");
            await expectCode(newDma({ name: "   " }), "BAD_REQUEST");
        });
    });

    describe("versioned edits and their valve sets", () => {
        it("gives each version its own valve set, and keeps the old one as history", async () => {
            const [a, b, c] = await Promise.all([newValve(), newValve(), newValve()]);
            const dma = await newDma({ boundaryValveIds: [a.id, b.id] });
            const edited = await admin().gis.dmas.update({
                id: dma.id,
                baseVersionId: dma.versionId,
                patch: { boundaryValveIds: [b.id, c.id] },
            });
            assert.deepEqual(edited.boundaryValveIds, [b.id, c.id].sort());

            const history = await admin().gis.dmas.history({ id: dma.id });
            assert.equal(history.length, 2);
            assert.deepEqual(history[0]?.boundaryValveIds, [b.id, c.id].sort());
            assert.deepEqual(history[1]?.boundaryValveIds, [a.id, b.id].sort(), "the old version still has the set it had");
            assert.equal(history[0]?.isHead, true);
            assert.equal(history[1]?.isHead, false);
        });

        it("carries the valves over when an edit doesn't mention them", async () => {
            const v = await newValve();
            const dma = await newDma({ boundaryValveIds: [v.id] });
            const renamed = await admin().gis.dmas.update({ id: dma.id, baseVersionId: dma.versionId, patch: { name: "Renamed only" } });
            assert.deepEqual(renamed.boundaryValveIds, [v.id]);
            assert.deepEqual((await admin().gis.dmas.byId({ id: dma.id })).boundaryValveIds, [v.id]);
        });

        it("can empty the valve set", async () => {
            const v = await newValve();
            const dma = await newDma({ boundaryValveIds: [v.id] });
            const cleared = await admin().gis.dmas.update({ id: dma.id, baseVersionId: dma.versionId, patch: { boundaryValveIds: [] } });
            assert.deepEqual(cleared.boundaryValveIds, []);
        });

        it("updates the registry label on main", async () => {
            const dma = await newDma({ name: "Before" });
            await admin().gis.dmas.update({ id: dma.id, baseVersionId: dma.versionId, patch: { name: "After" } });
            const [asset] = await env.db.select().from(assets).where(eq(assets.id, dma.id));
            assert.equal(asset?.label, "After");
        });

        it("rolls the whole edit back if it would point at something invalid", async () => {
            const dma = await newDma();
            const junction = await newJunction();
            await expectCode(
                admin().gis.dmas.update({ id: dma.id, baseVersionId: dma.versionId, patch: { inletMeterId: junction.id } }),
                "BAD_REQUEST",
            );
            assert.equal((await admin().gis.dmas.byId({ id: dma.id })).versionId, dma.versionId, "still the original version");
            assert.equal((await admin().gis.dmas.history({ id: dma.id })).length, 1);
        });

        it("rejects an edit based on a stale version", async () => {
            const dma = await newDma();
            await admin().gis.dmas.update({ id: dma.id, baseVersionId: dma.versionId, patch: { name: "First" } });
            await expectCode(
                admin().gis.dmas.update({ id: dma.id, baseVersionId: dma.versionId, patch: { name: "Stale" } }),
                "CONFLICT",
            );
        });

        it("hides a deleted DMA, whose tombstone has no valves, and refuses further edits", async () => {
            const v = await newValve();
            const dma = await newDma({ boundaryValveIds: [v.id] });
            await admin().gis.dmas.delete({ id: dma.id, baseVersionId: dma.versionId });
            assert.ok(!(await admin().gis.dmas.list()).some((d) => d.id === dma.id));
            await expectCode(admin().gis.dmas.byId({ id: dma.id }), "NOT_FOUND");

            const history = await admin().gis.dmas.history({ id: dma.id });
            assert.equal(history.length, 2);
            assert.equal(history[0]?.isDeleted, true);
            assert.deepEqual(history[0]?.boundaryValveIds, []);
            await expectCode(
                admin().gis.dmas.update({ id: dma.id, baseVersionId: history[0]!.versionId, patch: { name: "Zombie" } }),
                "NOT_FOUND",
            );
        });
    });

    describe("branches", () => {
        it("keeps a branch's valve change off main", async () => {
            const [a, b] = await Promise.all([newValve(), newValve()]);
            const dma = await newDma({ boundaryValveIds: [a.id] });
            await admin().gis.dmas.update({
                id: dma.id,
                baseVersionId: dma.versionId,
                branch: "reshape",
                patch: { boundaryValveIds: [a.id, b.id], name: "Reshaped" },
            });

            const onMain = await admin().gis.dmas.byId({ id: dma.id });
            assert.deepEqual(onMain.boundaryValveIds, [a.id]);
            assert.equal(onMain.name, dma.name);
            const onBranch = await admin().gis.dmas.byId({ id: dma.id, branch: "reshape" });
            assert.deepEqual(onBranch.boundaryValveIds, [a.id, b.id].sort());

            const view = await admin().gis.dmas.list({ branch: "reshape" });
            assert.equal(view.filter((d) => d.id === dma.id).length, 1);
        });

        it("keeps a DMA created on a branch off main, and lets it use main's nodes", async () => {
            const meter = await newMeter();
            const valve = await newValve();
            const dma = await newDma({ branch: "planning", inletMeterId: meter.id, boundaryValveIds: [valve.id] });
            assert.ok((await admin().gis.dmas.list({ branch: "planning" })).some((d) => d.id === dma.id));
            assert.ok(!(await admin().gis.dmas.list()).some((d) => d.id === dma.id));
            await expectCode(admin().gis.dmas.byId({ id: dma.id }), "NOT_FOUND");
        });

        it("won't let main use a node that only exists on a branch", async () => {
            const draftMeter = await newMeter({ branch: "draft-meters" });
            await expectCode(newDma({ inletMeterId: draftMeter.id }), "BAD_REQUEST");
            const onBranch = await newDma({ branch: "draft-meters", inletMeterId: draftMeter.id });
            assert.equal(onBranch.branch, "draft-meters");
        });
    });

    describe("concurrency", () => {
        it("lets exactly one of two racing edits win, leaving no stray valve rows", async () => {
            const [a, b] = await Promise.all([newValve(), newValve()]);
            const dma = await newDma();
            const results = await Promise.allSettled([
                admin().gis.dmas.update({ id: dma.id, baseVersionId: dma.versionId, patch: { boundaryValveIds: [a.id] } }),
                tech().gis.dmas.update({ id: dma.id, baseVersionId: dma.versionId, patch: { boundaryValveIds: [b.id] } }),
            ]);
            assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
            const lost = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
            assert.equal((lost?.reason as { code?: string } | undefined)?.code, "CONFLICT");

            const history = await admin().gis.dmas.history({ id: dma.id });
            assert.equal(history.length, 2, "the original and the winner; the loser left nothing behind");
            const head = (await admin().gis.dmas.byId({ id: dma.id })).boundaryValveIds;
            assert.ok(head.length === 1 && (head[0] === a.id || head[0] === b.id));
        });
    });

    describe("deleting a node a DMA depends on", () => {
        it("is refused for the inlet meter and for a boundary valve", async () => {
            const meter = await newMeter();
            const valve = await newValve();
            await newDma({ inletMeterId: meter.id, boundaryValveIds: [valve.id] });

            await expectCode(admin().gis.nodes.delete({ id: meter.id, baseVersionId: meter.versionId }), "CONFLICT");
            await expectCode(admin().gis.nodes.delete({ id: valve.id, baseVersionId: valve.versionId }), "CONFLICT");
        });

        it("is allowed once the DMA is deleted", async () => {
            const meter = await newMeter();
            const dma = await newDma({ inletMeterId: meter.id });
            await admin().gis.dmas.delete({ id: dma.id, baseVersionId: dma.versionId });
            await admin().gis.nodes.delete({ id: meter.id, baseVersionId: meter.versionId });
            await expectCode(admin().gis.nodes.byId({ id: meter.id }), "NOT_FOUND");
        });

        it("is allowed once the valve has been taken off the DMA", async () => {
            const valve = await newValve();
            const dma = await newDma({ boundaryValveIds: [valve.id] });
            await admin().gis.dmas.update({ id: dma.id, baseVersionId: dma.versionId, patch: { boundaryValveIds: [] } });
            await admin().gis.nodes.delete({ id: valve.id, baseVersionId: valve.versionId });
            await expectCode(admin().gis.nodes.byId({ id: valve.id }), "NOT_FOUND");
        });

        it("judges by what the caller's branch sees, not by main alone", async () => {
            const meter = await newMeter();
            const dma = await newDma({ inletMeterId: meter.id });

            // On a branch the DMA is gone, so its meter can go too...
            await admin().gis.dmas.delete({ id: dma.id, baseVersionId: dma.versionId, branch: "unlink" });
            await admin().gis.nodes.delete({ id: meter.id, baseVersionId: meter.versionId, branch: "unlink" });

            // ...but on main the DMA still uses it.
            await expectCode(admin().gis.nodes.delete({ id: meter.id, baseVersionId: meter.versionId }), "CONFLICT");
        });
    });

    describe("tenant isolation", () => {
        it("never shows another organization's DMAs", async () => {
            const mine = await newDma();
            assert.ok(!(await env.outsider().gis.dmas.list()).some((d) => d.id === mine.id));
            await expectCode(env.outsider().gis.dmas.byId({ id: mine.id }), "NOT_FOUND");
            await expectCode(env.outsider().gis.dmas.history({ id: mine.id }), "NOT_FOUND");
        });

        it("won't let another organization edit, delete or claim a DMA's id", async () => {
            const mine = await newDma();
            const outsider = env.outsider();
            await expectCode(outsider.gis.dmas.update({ id: mine.id, baseVersionId: mine.versionId, patch: { name: "Hijacked" } }), "NOT_FOUND");
            await expectCode(outsider.gis.dmas.delete({ id: mine.id, baseVersionId: mine.versionId }), "NOT_FOUND");

            const theirMeter = await outsider.gis.nodes.create({ type: "meter", name: "Their meter", location: P(0, 0) });
            await expectCode(
                outsider.gis.dmas.create({ id: mine.id, name: "Squatter", color: "#112233", tierId: tierB, inletMeterId: theirMeter.id, ring: RING }),
                "CONFLICT",
            );
            assert.equal((await admin().gis.dmas.byId({ id: mine.id })).name, mine.name);
        });
    });
});