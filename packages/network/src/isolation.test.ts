import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { traceIsolation } from "./isolation";
import { ids, line, twoValves } from "./test-fixtures";

describe("traceIsolation", () => {
    it("returns an empty result for a pipe that doesn't exist", () => {
        const { nodes, pipes } = line();
        assert.deepEqual(traceIsolation("nope", nodes, pipes), {
            affectedNodes: [],
            valvesToClose: [],
            alreadyClosed: [],
            unisolatedSources: [],
        });
    });

    it("stops at the open valve beside the break and reports what's cut off", () => {
        const { nodes, pipes } = line(true);
        const result = traceIsolation("p3", nodes, pipes); // the pipe between V and B
        assert.deepEqual(ids(result.valvesToClose), ["V"]);
        assert.deepEqual(ids(result.affectedNodes), ["B", "C"]);
        assert.deepEqual(result.alreadyClosed, []);
    });

    it("doesn't treat a dead-end customer meter as an isolation problem", () => {
        const { nodes, pipes } = line(true);
        const result = traceIsolation("p3", nodes, pipes);
        assert.ok(ids(result.affectedNodes).includes("C"), "the meter loses supply");
        assert.deepEqual(result.unisolatedSources, [], "but a leaf meter is not a failure to isolate");
    });

    it("lists an already-closed valve as a boundary, not as something to close", () => {
        const { nodes, pipes } = line(false);
        const result = traceIsolation("p3", nodes, pipes);
        assert.deepEqual(result.valvesToClose, []);
        assert.deepEqual(ids(result.alreadyClosed), ["V"]);
        assert.deepEqual(ids(result.affectedNodes), ["B", "C"]);
    });

    it("flags a break that's connected to a supply source with no valve in between", () => {
        const { nodes, pipes } = line(true);
        const result = traceIsolation("p2", nodes, pipes); // between A and V; A connects straight back to R
        assert.deepEqual(ids(result.unisolatedSources), ["R"]);
        assert.deepEqual(ids(result.valvesToClose), ["V"]);
        assert.deepEqual(ids(result.affectedNodes), ["A", "R"]);
    });

    it("flags a break on the pipe directly attached to a source", () => {
        const { nodes, pipes } = twoValves();
        const result = traceIsolation("q1", nodes, pipes); // between R and V1
        assert.deepEqual(ids(result.unisolatedSources), ["R"]);
        assert.deepEqual(ids(result.valvesToClose), ["V1"]);
        assert.deepEqual(ids(result.affectedNodes), ["R"]);
    });

    it("closes the valves on both sides of a break between two valves", () => {
        const { nodes, pipes } = twoValves();
        const result = traceIsolation("q2", nodes, pipes); // between V1 and A
        assert.deepEqual(ids(result.valvesToClose), ["V1", "V2"]);
        assert.deepEqual(ids(result.affectedNodes), ["A"]);
        assert.deepEqual(result.unisolatedSources, []);
    });

    it("routes around a valve that won't operate to the next one beyond it", () => {
        const { nodes, pipes } = twoValves();
        const result = traceIsolation("q2", nodes, pipes, ["V2"]);
        assert.deepEqual(ids(result.valvesToClose), ["V1"]);
        // V2 is now inside the affected area, along with everything past it.
        assert.deepEqual(ids(result.affectedNodes), ["A", "B", "C", "V2"]);
    });

    it("lets a closed valve stop the trace whether or not it was marked as skipped", () => {
        const { nodes, pipes } = twoValves(true, false);
        for (const skip of [[], ["V2"]]) {
            const result = traceIsolation("q2", nodes, pipes, skip);
            assert.deepEqual(ids(result.valvesToClose), ["V1"]);
            assert.deepEqual(ids(result.alreadyClosed), ["V2"]);
            assert.deepEqual(ids(result.affectedNodes), ["A"]);
        }
    });

    it("returns the caller's own node objects, not copies", () => {
        const { nodes, pipes } = line(true);
        const result = traceIsolation("p3", nodes, pipes);
        assert.equal(result.valvesToClose[0], nodes.find((n) => n.id === "V"));
    });
});