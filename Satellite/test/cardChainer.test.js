// §16.4 (Issue 4): a card's version lineage is scoped to {project, chat, category}, not category
// alone — so unrelated threads in different chats don't collapse into one version chain.
// Pure-fn test, no Mongo/network (matches deltaEngine.test.js style). Run: `node --test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { chainParentFilter } = require("../services/cardChainer");

test("chainParentFilter scopes the version-parent lookup to chat + category", () => {
  const f = chainParentFilter("proj1", "chatA", "risk");
  assert.deepEqual(f, {
    projectId: "proj1",
    sourceChatIds: "chatA",
    category: "risk",
    status: "active",
  });
});

test("same category in different chats → DIFFERENT lineage queries (no cross-chat conflation)", () => {
  const a = chainParentFilter("proj1", "chatA", "risk");
  const b = chainParentFilter("proj1", "chatB", "risk");
  assert.notDeepEqual(a, b);
  assert.equal(a.sourceChatIds, "chatA");
  assert.equal(b.sourceChatIds, "chatB");
});

test("different categories in the same chat → DIFFERENT lineages", () => {
  const risk = chainParentFilter("p", "c", "risk");
  const decision = chainParentFilter("p", "c", "decision");
  assert.notEqual(risk.category, decision.category);
});

test("only active cards are eligible version parents", () => {
  assert.equal(chainParentFilter("p", "c", "decision").status, "active");
});
