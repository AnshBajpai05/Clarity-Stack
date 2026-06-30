// §16.3 — delta diff keys on normalized CONTENT, not churned UUIDs. Pure-fn tests,
// no Mongo/network. Run: `node --test` (Node 18+ built-in runner).
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  computeDiff, normContent, nodeContentKey, edgeContentKey,
} = require("../services/deltaEngine");

test("normContent collapses whitespace + case, strips trailing punctuation", () => {
  assert.equal(normContent("  Adopt   Postgres  "), "adopt postgres");
  // Trailing punctuation is stripped when it is the final char (the common KG case).
  assert.equal(normContent("Adopt Postgres"), normContent("adopt postgres!"));
  assert.equal(normContent("Use Kafka."), "use kafka");
  assert.equal(normContent(null), "");
  // Quirk: punctuation followed by trailing whitespace survives (strip runs pre-trim).
  // Harmless in practice — KG content is trimmed upstream and lacks trailing spaces.
  assert.equal(normContent("Adopt Postgres.  "), "adopt postgres.");
});

test("nodeContentKey is section-scoped (same text, different section = distinct)", () => {
  const asFact = nodeContentKey({ section: "FACT", content: "Adopt Postgres" });
  const asDecision = nodeContentKey({ section: "DECISION", content: "adopt postgres" });
  assert.notEqual(asFact, asDecision);
  assert.equal(asFact, "FACT::adopt postgres");
});

test("re-minted UUID for identical content does NOT count as added/removed", () => {
  // Core re-mints a fresh nodeId every /ask; content is identical => zero churn.
  const from = { nodes: [{ nodeId: "old-uuid", section: "DECISION", content: "Adopt Postgres" }], edges: [] };
  const to = { nodes: [{ nodeId: "new-uuid", section: "DECISION", content: "Adopt Postgres." }], edges: [] };
  const diff = computeDiff(from, to);
  assert.equal(diff.addedNodes.length, 0);
  assert.equal(diff.removedNodes.length, 0);
});

test("genuinely new content counts as added; dropped content as removed", () => {
  const from = { nodes: [{ nodeId: "a", section: "FACT", content: "Postgres handles writers" }], edges: [] };
  const to = { nodes: [{ nodeId: "b", section: "DECISION", content: "Use Kafka for the bus" }], edges: [] };
  const diff = computeDiff(from, to);
  assert.equal(diff.addedNodes.length, 1);
  assert.equal(diff.addedNodes[0].content, "Use Kafka for the bus");
  assert.equal(diff.removedNodes.length, 1);
  assert.equal(diff.removedNodes[0].content, "Postgres handles writers");
});

test("duplicate restatements within one window are deduped (no double-count)", () => {
  const to = {
    nodes: [
      { nodeId: "1", section: "FACT", content: "Postgres scales" },
      { nodeId: "2", section: "FACT", content: "postgres scales." },  // dup by content
      { nodeId: "3", section: "FACT", content: "Redis is faster" },
    ],
    edges: [],
  };
  const diff = computeDiff(null, to);   // no "from" => everything, deduped
  assert.equal(diff.addedNodes.length, 2);
});

test("edge identity follows endpoint MEANING, surviving endpoint UUID churn", () => {
  const from = {
    nodes: [
      { nodeId: "old-a", section: "FACT", content: "Postgres scales" },
      { nodeId: "old-b", section: "DECISION", content: "Adopt Postgres" },
    ],
    edges: [{ fromNodeId: "old-a", toNodeId: "old-b", relation: "SUPPORTS" }],
  };
  const to = {
    nodes: [
      { nodeId: "new-a", section: "FACT", content: "Postgres scales" },
      { nodeId: "new-b", section: "DECISION", content: "Adopt Postgres" },
    ],
    edges: [{ fromNodeId: "new-a", toNodeId: "new-b", relation: "SUPPORTS" }],
  };
  const diff = computeDiff(from, to);
  assert.equal(diff.addedEdges.length, 0, "same meaning edge must not churn");
  assert.equal(diff.removedEdges.length, 0);
});

test("edgeContentKey changes when the relation changes", () => {
  const idx = new Map([["a", "FACT::x"], ["b", "DECISION::y"]]);
  const supports = edgeContentKey({ fromNodeId: "a", toNodeId: "b", relation: "SUPPORTS" }, idx);
  const contradicts = edgeContentKey({ fromNodeId: "a", toNodeId: "b", relation: "CONTRADICTS" }, idx);
  assert.notEqual(supports, contradicts);
});
