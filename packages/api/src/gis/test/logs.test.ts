import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { domainEvents } from "@majimap/db";
import { ConditionLogSchema, ValveStateLogSchema } from "@majimap/shared-types";
import { expectCode, setupTestEnv, type TestEnv } from "./test-support";

// Integration tests against a real, migrated Postgres + PostGIS. Skipped unless
// TEST_DATABASE_URL is set; creates uniquely named data and never cleans it up,
// so point it at a throwaway database.
const url = process.env.TEST_DATABASE_URL;

const P = (lat: number, lng: number) => ({ lat, lng });
/** Fixed moments in the past: "the newest observation wins" is what most of these test, and a clock that moves between calls would make that flaky. */
const T = (day: number) => `2025-03-${String(day).padStart(2, "0")}T08:00:00.000Z`;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("gis.logs", { skip: !url }, () => {
    let env: TestEnv;
    let tier: string;

    before(async () => {
        env = await setupTestEnv();
        tier = (await env.admin().gis.tiers.create({ name: "Logs tier", order: 1 })).id;
    });
    after(async () => {
        await env.close();
    });

    const admin = () => env.admin();
    const tech = () => env.tech();
    const shortId = () => Math.random().toString(36).slice(2, 7);

    type NodeInput = Parameters<ReturnType<TestEnv["admin"]>["gis"]["nodes"]["create"]>[0];
    const newNode = (type: NodeInput["type"] = "junction", overrides: Partial<NodeInput> = {}) =>
        admin().gis.nodes.create({
            type,
            name: `${type} ${shortId()}`,
            location: P(-1.29, 36.78),
            condition: "good",
            isOpen: type === "valve" ? true : null,
            ...overrides,
        });
    const newValve = (overrides: Partial<NodeInput> = {}) => newNode("valve", overrides);

    const newPipe = async () => {
        const [a, b] = await Promise.all([newNode(), newNode("junction", { location: P(-1.3, 36.78) })]);
        return admin().gis.pipes.create({
            fromNodeId: a.id,
            toNodeId: b.id,
            path: [a.location, b.location],
            diameterMm: 200,
            condition: "good",
        });
    };
    const newStructure = () =>
        admin().gis.structures.create({ type: "vault", name: `Vault ${shortId()}`, location: P(-1.29, 36.78), condition: "good" });

    const conditionEvents = (assetId: string) =>
        env.db
            .select()
            .from(domainEvents)
            .where(
                and(
                    eq(domainEvents.type, "asset.condition_changed"),
                    sql`${domainEvents.payload}->>'assetId' = ${assetId}`,
                ),
            );

    describe("access control", () => {
        it("rejects callers who aren't signed in", async () => {
            await expectCode(env.anonymous().gis.logs.conditionFeed({}), "UNAUTHORIZED");
        });

        it("lets a viewer read but not record", async () => {
            const node = await newNode();
            await env.viewer().gis.logs.conditionFeed({});
            await env.viewer().gis.logs.conditionHistory({ assetId: node.id });
            await env.viewer().gis.logs.valveHistory({ valveId: node.id });
            await expectCode(
                env.viewer().gis.logs.recordCondition({ assetId: node.id, condition: "poor", recordedAt: T(1) }),
                "FORBIDDEN",
            );
            await expectCode(
                env.viewer().gis.logs.recordValveState({ valveId: node.id, isOpen: false, changedAt: T(1) }),
                "FORBIDDEN",
            );
        });

        it("lets a field technician record", async () => {
            const node = await newNode();
            const result = await tech().gis.logs.recordCondition({ assetId: node.id, condition: "fair", recordedAt: T(1) });
            assert.equal(result.outcome, "applied");
            assert.equal(result.log.recordedByUserId, env.users.tech);
        });
    });

    describe("recording a condition", () => {
        it("logs an inspection of a node and brings the node into line with it", async () => {
            const node = await newNode("valve");
            const { log, outcome } = await admin().gis.logs.recordCondition({
                assetId: node.id,
                condition: "poor",
                note: "  Stem badly corroded  ",
                recordedAt: T(1),
            });

            assert.equal(outcome, "applied");
            assert.equal(log.note, "Stem badly corroded", "the note is trimmed");
            assert.deepEqual(
                [log.assetType, log.nodeId, log.pipeId, log.structureId, log.branch],
                ["node", node.id, null, null, "main"],
            );
            assert.equal(log.recordedAt, T(1));
            assert.ok(!Number.isNaN(Date.parse(log.syncedAt)));
            assert.equal(ConditionLogSchema.parse(log).id, log.id);

            const after = await admin().gis.nodes.byId({ id: node.id });
            assert.equal(after.condition, "poor");
            assert.equal(after.lastInspectedAt, T(1));
            assert.equal((await admin().gis.nodes.history({ id: node.id })).length, 2, "an ordinary versioned edit");

            const events = await conditionEvents(node.id);
            assert.equal(events.length, 1);
            assert.deepEqual(events[0]?.payload, {
                assetId: node.id,
                from: "good",
                to: "poor",
                changedByUserId: env.users.admin,
            });
        });

        it("logs an inspection of a pipe, which has no last-inspected date to update", async () => {
            const pipe = await newPipe();
            const { log, outcome } = await admin().gis.logs.recordCondition({
                assetId: pipe.id,
                condition: "critical",
                recordedAt: T(1),
            });
            assert.equal(outcome, "applied");
            assert.deepEqual([log.assetType, log.nodeId, log.pipeId], ["pipe", null, pipe.id]);
            assert.equal(ConditionLogSchema.parse(log).pipeId, pipe.id);
            assert.equal((await admin().gis.pipes.byId({ id: pipe.id })).condition, "critical");
        });

        it("logs an inspection of a structure", async () => {
            const structure = await newStructure();
            const { log, outcome } = await admin().gis.logs.recordCondition({
                assetId: structure.id,
                condition: "fair",
                recordedAt: T(1),
            });
            assert.equal(outcome, "applied");
            assert.deepEqual([log.assetType, log.nodeId, log.pipeId, log.structureId], ["structure", null, null, structure.id]);
            const after = await admin().gis.structures.byId({ id: structure.id });
            assert.equal(after.condition, "fair");
            assert.equal(after.lastInspectedAt, T(1));
        });

        it("keeps the log but leaves the asset alone when nothing about it changes", async () => {
            const pipe = await newPipe();
            const { log, outcome } = await admin().gis.logs.recordCondition({ assetId: pipe.id, condition: "good", recordedAt: T(1) });
            assert.equal(outcome, "unchanged");
            assert.equal((await admin().gis.pipes.byId({ id: pipe.id })).versionId, pipe.versionId);
            assert.deepEqual((await admin().gis.logs.conditionHistory({ assetId: pipe.id })).map((l) => l.id), [log.id]);
        });

        it("moves the last-inspected date without calling it a condition change", async () => {
            const node = await newNode();
            const first = await admin().gis.logs.recordCondition({ assetId: node.id, condition: "good", recordedAt: T(1) });
            assert.equal(first.outcome, "applied");
            assert.equal((await admin().gis.nodes.byId({ id: node.id })).lastInspectedAt, T(1));
            assert.equal((await conditionEvents(node.id)).length, 0, "the condition didn't change, so there's nothing for other modules to react to");

            const again = await admin().gis.logs.recordCondition({ assetId: node.id, condition: "good", recordedAt: T(1) });
            assert.equal(again.outcome, "unchanged", "an inspection no newer than the last one changes nothing");
        });

        it("stores an empty note as no note", async () => {
            const node = await newNode();
            const blank = await admin().gis.logs.recordCondition({ assetId: node.id, condition: "fair", note: "   ", recordedAt: T(1) });
            const omitted = await admin().gis.logs.recordCondition({ assetId: node.id, condition: "poor", recordedAt: T(2) });
            assert.equal(blank.log.note, null);
            assert.equal(omitted.log.note, null);
        });

        it("rejects a condition that isn't one", async () => {
            const node = await newNode();
            await expectCode(
                admin().gis.logs.recordCondition({ assetId: node.id, condition: "terrible" as never, recordedAt: T(1) }),
                "BAD_REQUEST",
            );
        });
    });

    describe("the newest observation wins", () => {
        it("records a late-arriving older inspection as history without undoing a newer one", async () => {
            const node = await newNode();
            const newer = await admin().gis.logs.recordCondition({ assetId: node.id, condition: "poor", recordedAt: T(2) });
            const older = await admin().gis.logs.recordCondition({ assetId: node.id, condition: "good", recordedAt: T(1) });

            assert.equal(newer.outcome, "applied");
            assert.equal(older.outcome, "stale");
            assert.equal((await admin().gis.nodes.byId({ id: node.id })).condition, "poor", "this morning's inspection stands");
            assert.deepEqual(
                (await admin().gis.logs.conditionHistory({ assetId: node.id })).map((l) => [l.recordedAt, l.condition]),
                [[T(2), "poor"], [T(1), "good"]],
                "both are kept, newest first by when they happened",
            );
        });

        it("orders history by when each inspection happened, not by when it arrived", async () => {
            const pipe = await newPipe();
            for (const [day, condition] of [[2, "fair"], [1, "poor"], [3, "critical"]] as const) {
                await admin().gis.logs.recordCondition({ assetId: pipe.id, condition, recordedAt: T(day) });
            }
            const history = await admin().gis.logs.conditionHistory({ assetId: pipe.id });
            assert.deepEqual(history.map((l) => l.recordedAt), [T(3), T(2), T(1)]);
            assert.deepEqual((await admin().gis.logs.conditionHistory({ assetId: pipe.id, limit: 2 })).map((l) => l.recordedAt), [T(3), T(2)]);
        });
    });

    describe("retries and clocks", () => {
        it("treats a retried record with the same id as a no-op", async () => {
            const node = await newNode();
            const clientId = env.id("offlinelog");
            const first = await admin().gis.logs.recordCondition({ id: clientId, assetId: node.id, condition: "poor", recordedAt: T(1) });
            const retry = await admin().gis.logs.recordCondition({ id: clientId, assetId: node.id, condition: "good", recordedAt: T(1) });

            assert.equal(first.outcome, "applied");
            assert.equal(retry.outcome, "replayed");
            assert.equal(retry.log.condition, "poor", "what's there is what comes back, not what the retry said");
            assert.equal((await admin().gis.logs.conditionHistory({ assetId: node.id })).length, 1);
            assert.equal((await admin().gis.nodes.history({ id: node.id })).length, 2, "the retry changed nothing");
        });

        it("won't let one organization claim another's log id", async () => {
            const mine = await newNode();
            const theirs = await env.outsider().gis.nodes.create({ type: "junction", name: "Theirs", location: P(0, 0) });
            const clientId = env.id("sharedlog");
            await admin().gis.logs.recordCondition({ id: clientId, assetId: mine.id, condition: "poor", recordedAt: T(1) });
            await expectCode(
                env.outsider().gis.logs.recordCondition({ id: clientId, assetId: theirs.id, condition: "poor", recordedAt: T(1) }),
                "CONFLICT",
            );
        });

        it("refuses a time more than a day ahead but forgives a little clock drift", async () => {
            const node = await newNode();
            await expectCode(
                admin().gis.logs.recordCondition({
                    assetId: node.id,
                    condition: "poor",
                    recordedAt: new Date(Date.now() + 2 * DAY_MS).toISOString(),
                }),
                "BAD_REQUEST",
            );

            const slightlyAhead = new Date(Date.now() + 60 * 60 * 1000).toISOString();
            const result = await admin().gis.logs.recordCondition({ assetId: node.id, condition: "poor", recordedAt: slightlyAhead });
            assert.equal(result.log.recordedAt, slightlyAhead);
        });
    });

    describe("what can be logged against", () => {
        it("reports an asset that doesn't exist", async () => {
            await expectCode(
                admin().gis.logs.recordCondition({ assetId: env.id("ghostasset"), condition: "poor", recordedAt: T(1) }),
                "NOT_FOUND",
            );
        });

        it("reports a deleted asset", async () => {
            const node = await newNode();
            await admin().gis.nodes.delete({ id: node.id, baseVersionId: node.versionId });
            await expectCode(admin().gis.logs.recordCondition({ assetId: node.id, condition: "poor", recordedAt: T(1) }), "NOT_FOUND");
        });

        it("won't inspect a DMA, which is an area", async () => {
            const meter = await newNode("meter");
            const dma = await admin().gis.dmas.create({
                name: "Area",
                color: "#3B82F6",
                tierId: tier,
                inletMeterId: meter.id,
                ring: [P(-1.29, 36.78), P(-1.29, 36.79), P(-1.3, 36.79), P(-1.3, 36.78)],
            });
            await expectCode(admin().gis.logs.recordCondition({ assetId: dma.id, condition: "poor", recordedAt: T(1) }), "BAD_REQUEST");
        });

        it("won't touch another organization's asset", async () => {
            const theirs = await env.outsider().gis.nodes.create({ type: "junction", name: "Theirs", location: P(0, 0) });
            await expectCode(admin().gis.logs.recordCondition({ assetId: theirs.id, condition: "poor", recordedAt: T(1) }), "NOT_FOUND");
            await expectCode(admin().gis.logs.conditionHistory({ assetId: theirs.id }), "NOT_FOUND");
        });
    });

    describe("recording on a branch", () => {
        it("keeps the log, but the asset change is just a proposal", async () => {
            const node = await newNode();
            const { log, outcome } = await admin().gis.logs.recordCondition({
                assetId: node.id,
                branch: "field-inspection",
                condition: "critical",
                recordedAt: T(1),
            });

            assert.equal(outcome, "applied");
            assert.equal(log.branch, "field-inspection");
            assert.equal((await admin().gis.nodes.byId({ id: node.id })).condition, "good", "main hasn't changed");
            assert.equal((await admin().gis.nodes.byId({ id: node.id, branch: "field-inspection" })).condition, "critical");
            assert.equal((await conditionEvents(node.id)).length, 0, "an unreconciled change isn't a fact other modules react to");
            assert.ok(
                (await admin().gis.logs.conditionHistory({ assetId: node.id })).some((l) => l.id === log.id),
                "the inspection itself is a fact and shows up regardless of branch",
            );
        });
    });

    describe("the condition feed", () => {
        it("filters by condition, newest first, and by date", async () => {
            const [critical, fine, poor] = await Promise.all([newNode(), newNode(), newNode()]);
            const a = await admin().gis.logs.recordCondition({ assetId: critical.id, condition: "critical", recordedAt: T(20) });
            const b = await admin().gis.logs.recordCondition({ assetId: fine.id, condition: "good", recordedAt: T(19) });
            const c = await admin().gis.logs.recordCondition({ assetId: poor.id, condition: "poor", recordedAt: T(18) });

            const alerts = await admin().gis.logs.conditionFeed({ conditions: ["critical", "poor"], limit: 200 });
            const ids = alerts.map((l) => l.id);
            assert.ok(ids.includes(a.log.id) && ids.includes(c.log.id));
            assert.ok(!ids.includes(b.log.id), "a 'good' inspection isn't an alert");
            assert.ok(alerts.every((l) => l.condition === "critical" || l.condition === "poor"));
            const times = alerts.map((l) => Date.parse(l.recordedAt));
            assert.deepEqual(times, [...times].sort((x, y) => y - x), "newest first");

            const recent = await admin().gis.logs.conditionFeed({ since: T(19), limit: 200 });
            const recentIds = recent.map((l) => l.id);
            assert.ok(recentIds.includes(a.log.id) && recentIds.includes(b.log.id));
            assert.ok(!recentIds.includes(c.log.id), "older than the cut-off");
        });

        it("never shows another organization's logs", async () => {
            const node = await newNode();
            const { log } = await admin().gis.logs.recordCondition({ assetId: node.id, condition: "poor", recordedAt: T(1) });
            const theirs = await env.outsider().gis.logs.conditionFeed({ limit: 200 });
            assert.ok(!theirs.some((l) => l.id === log.id));
        });
    });

    describe("recording a valve's state", () => {
        it("logs the operation and brings the valve into line with it", async () => {
            const valve = await newValve();
            const { log, outcome } = await admin().gis.logs.recordValveState({
                valveId: valve.id,
                isOpen: false,
                note: "  Closed for the burst on Mombasa Road  ",
                changedAt: T(1),
            });

            assert.equal(outcome, "applied");
            assert.equal(log.nodeId, valve.id);
            assert.equal(log.isOpen, false);
            assert.equal(log.note, "Closed for the burst on Mombasa Road");
            assert.equal(log.changedAt, T(1));
            assert.equal(log.changedByUserId, env.users.admin);
            assert.equal(ValveStateLogSchema.parse(log).id, log.id);
            assert.equal((await admin().gis.nodes.byId({ id: valve.id })).isOpen, false);
        });

        it("keeps the log but leaves the valve alone when it's already in that state", async () => {
            const valve = await newValve();
            const { outcome } = await admin().gis.logs.recordValveState({ valveId: valve.id, isOpen: true, changedAt: T(1) });
            assert.equal(outcome, "unchanged");
            assert.equal((await admin().gis.nodes.byId({ id: valve.id })).versionId, valve.versionId);
            assert.equal((await admin().gis.logs.valveHistory({ valveId: valve.id })).length, 1);
        });

        it("records a late-arriving older operation as history without undoing a newer one", async () => {
            const valve = await newValve();
            const newer = await admin().gis.logs.recordValveState({ valveId: valve.id, isOpen: false, changedAt: T(2) });
            const older = await admin().gis.logs.recordValveState({ valveId: valve.id, isOpen: true, changedAt: T(1) });

            assert.equal(newer.outcome, "applied");
            assert.equal(older.outcome, "stale");
            assert.equal((await admin().gis.nodes.byId({ id: valve.id })).isOpen, false);
            assert.deepEqual(
                (await admin().gis.logs.valveHistory({ valveId: valve.id })).map((l) => [l.changedAt, l.isOpen]),
                [[T(2), false], [T(1), true]],
            );
            assert.deepEqual((await admin().gis.logs.valveHistory({ valveId: valve.id, limit: 1 })).map((l) => l.changedAt), [T(2)]);
        });

        it("treats a retried record with the same id as a no-op", async () => {
            const valve = await newValve();
            const clientId = env.id("offlinevalve");
            const first = await admin().gis.logs.recordValveState({ id: clientId, valveId: valve.id, isOpen: false, changedAt: T(1) });
            const retry = await admin().gis.logs.recordValveState({ id: clientId, valveId: valve.id, isOpen: true, changedAt: T(1) });
            assert.equal(first.outcome, "applied");
            assert.equal(retry.outcome, "replayed");
            assert.equal(retry.log.isOpen, false);
            assert.equal((await admin().gis.logs.valveHistory({ valveId: valve.id })).length, 1);
        });

        it("only applies to valves that exist", async () => {
            const junction = await newNode("junction");
            await expectCode(admin().gis.logs.recordValveState({ valveId: junction.id, isOpen: false, changedAt: T(1) }), "BAD_REQUEST");
            await expectCode(admin().gis.logs.recordValveState({ valveId: env.id("ghostvalve"), isOpen: false, changedAt: T(1) }), "NOT_FOUND");

            const gone = await newValve();
            await admin().gis.nodes.delete({ id: gone.id, baseVersionId: gone.versionId });
            await expectCode(admin().gis.logs.recordValveState({ valveId: gone.id, isOpen: false, changedAt: T(1) }), "NOT_FOUND");
        });

        it("keeps the log on a branch, but the valve change is just a proposal", async () => {
            const valve = await newValve();
            const { log } = await admin().gis.logs.recordValveState({
                valveId: valve.id,
                branch: "valve-visit",
                isOpen: false,
                changedAt: T(1),
            });
            assert.equal(log.branch, "valve-visit");
            assert.equal((await admin().gis.nodes.byId({ id: valve.id })).isOpen, true, "main hasn't changed");
            assert.equal((await admin().gis.nodes.byId({ id: valve.id, branch: "valve-visit" })).isOpen, false);
        });

        it("never touches another organization's valve", async () => {
            const theirs = await env.outsider().gis.nodes.create({ type: "valve", name: "Theirs", location: P(0, 0), isOpen: true });
            await expectCode(admin().gis.logs.recordValveState({ valveId: theirs.id, isOpen: false, changedAt: T(1) }), "NOT_FOUND");
            await expectCode(admin().gis.logs.valveHistory({ valveId: theirs.id }), "NOT_FOUND");
        });
    });
});