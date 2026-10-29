import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAdjacency } from "./graph";
import { distancesFromSources, traceDirectional } from "./directional";
import { ids, line, node, pipe, ring } from "./test-fixtures";

describe("distancesFromSources", () => {
    it("counts hops from the source along the line", () => {
        const { nodes, pipes } = line();
        const distances = distancesFromSources(nodes, buildAdjacency(pipes));
        assert.deepEqual(Object.fromEntries(distances), { R: 0, A: 1, V: 2, B: 3, C: 4 });
    });

    it("measures from the nearest of several sources", () => {
        const nodes = [node("R", "reservoir"), node("A", "junction"), node("P", "pumping_station")];
        const pipes = [pipe("x", "R", "A"), pipe("y", "A", "P")];
        const distances = distancesFromSources(nodes, buildAdjacency(pipes));
        assert.deepEqual(Object.fromEntries(distances), { R: 0, A: 1, P: 0 });
    });

    it("leaves nodes with no path to a source out entirely", () => {
        const { nodes, pipes } = line();
        const withIsland = [...nodes, node("Z", "junction")];
        const distances = distancesFromSources(withIsland, buildAdjacency(pipes));
        assert.equal(distances.has("Z"), false);
    });
});

describe("traceDirectional", () => {
    it("downstream moves away from the source", () => {
        const { nodes, pipes } = line(true);
        assert.deepEqual(ids(traceDirectional("A", "downstream", nodes, pipes)), ["A", "B", "C", "V"]);
    });

    it("upstream moves toward the source", () => {
        const { nodes, pipes } = line(true);
        assert.deepEqual(ids(traceDirectional("B", "upstream", nodes, pipes)), ["A", "B", "R", "V"]);
    });

    it("includes a closed valve downstream but stops there", () => {
        const { nodes, pipes } = line(false);
        assert.deepEqual(ids(traceDirectional("A", "downstream", nodes, pipes)), ["A", "V"]);
    });

    it("includes a closed valve upstream but stops there", () => {
        const { nodes, pipes } = line(false);
        assert.deepEqual(ids(traceDirectional("C", "upstream", nodes, pipes)), ["B", "C", "V"]);
    });

    it("still traces onward when you start on a closed valve", () => {
        const { nodes, pipes } = line(false);
        assert.deepEqual(ids(traceDirectional("V", "downstream", nodes, pipes)), ["B", "C", "V"]);
        assert.deepEqual(ids(traceDirectional("V", "upstream", nodes, pipes)), ["A", "R", "V"]);
    });

    it("terminates on a loop, with sideways steps counting as downstream only", () => {
        const { nodes, pipes } = ring();
        // R=0, A=1, B=2, C=2: from A, both B and C are away from the source.
        assert.deepEqual(ids(traceDirectional("A", "downstream", nodes, pipes)), ["A", "B", "C"]);
        // From B, only A is strictly closer; C is level with B so it isn't upstream.
        assert.deepEqual(ids(traceDirectional("B", "upstream", nodes, pipes)), ["A", "B", "R"]);
    });

    it("has no direction without a source: upstream is just the start, downstream is everything connected", () => {
        const nodes = [node("X", "junction"), node("Y", "junction"), node("Z", "junction")];
        const pipes = [pipe("a", "X", "Y"), pipe("b", "Y", "Z")];
        assert.deepEqual(ids(traceDirectional("X", "upstream", nodes, pipes)), ["X"]);
        assert.deepEqual(ids(traceDirectional("X", "downstream", nodes, pipes)), ["X", "Y", "Z"]);
    });

    it("returns nothing for a start node that isn't among the nodes", () => {
        const { nodes, pipes } = line();
        assert.deepEqual(traceDirectional("ghost", "downstream", nodes, pipes), []);
    });
});