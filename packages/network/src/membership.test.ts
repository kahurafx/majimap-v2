import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { traceSubnetworkMembership } from "./membership";
import { ids, line, node, pipe, ring } from "./test-fixtures";

describe("traceSubnetworkMembership", () => {
    it("reaches everything connected when every valve is open", () => {
        const { nodes, pipes } = line(true);
        assert.deepEqual(ids(traceSubnetworkMembership("R", nodes, pipes)), ["A", "B", "C", "R", "V"]);
    });

    it("treats a valve of unknown state as open", () => {
        const { nodes, pipes } = line(null);
        assert.deepEqual(ids(traceSubnetworkMembership("R", nodes, pipes)), ["A", "B", "C", "R", "V"]);
    });

    it("includes a closed valve but does not trace past it", () => {
        const { nodes, pipes } = line(false);
        assert.deepEqual(ids(traceSubnetworkMembership("R", nodes, pipes)), ["A", "R", "V"]);
    });

    it("sees the near side of a closed valve from the far end", () => {
        const { nodes, pipes } = line(false);
        assert.deepEqual(ids(traceSubnetworkMembership("C", nodes, pipes)), ["B", "C", "V"]);
    });

    it("spreads both ways when the controller is itself a closed valve", () => {
        const { nodes, pipes } = line(false);
        assert.deepEqual(ids(traceSubnetworkMembership("V", nodes, pipes)), ["A", "B", "C", "R", "V"]);
    });

    it("returns nothing for a controller that isn't among the nodes", () => {
        const { nodes, pipes } = line(true);
        assert.deepEqual(traceSubnetworkMembership("ghost", nodes, pipes), []);
    });

    it("ignores pipes that point at nodes which weren't loaded", () => {
        const nodes = [node("A", "junction")];
        const pipes = [pipe("p", "A", "missing")];
        assert.deepEqual(ids(traceSubnetworkMembership("A", nodes, pipes)), ["A"]);
    });

    it("returns the caller's own node objects, not copies", () => {
        const { nodes, pipes } = line(true);
        const reservoir = traceSubnetworkMembership("R", nodes, pipes).find((n) => n.id === "R");
        assert.equal(reservoir, nodes[0]);
    });

    it("visits each node once and terminates on a loop", () => {
        const { nodes, pipes } = ring();
        assert.deepEqual(ids(traceSubnetworkMembership("R", nodes, pipes)), ["A", "B", "C", "R"]);
    });

    it("handles a long chain without recursing", () => {
        const length = 5000;
        const nodes = Array.from({ length }, (_, i) => node(`n${i}`, "junction"));
        const pipes = Array.from({ length: length - 1 }, (_, i) => pipe(`p${i}`, `n${i}`, `n${i + 1}`));
        assert.equal(traceSubnetworkMembership("n0", nodes, pipes).length, length);
    });
});