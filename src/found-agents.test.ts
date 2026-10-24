import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENTS, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { findFoundAgents } from "./found-agents.ts";
import { SelectionError } from "./selection.ts";

function scanWith(found: AgentId[]): ScanResult[] {
  return AGENTS.map((agent) => ({
    agent,
    found: found.includes(agent.id),
    skillsDir: `/home/.${agent.id}/skills`,
  }));
}

test("findFoundAgents returns only the agents that were found, in registry order", () => {
  const found = findFoundAgents(() => scanWith(["chatgpt", "cursor"]));

  assert.deepEqual(
    found.map(({ agent }) => agent.id),
    ["cursor", "chatgpt"],
  );
});

test("findFoundAgents stops with an error when no agent was found", () => {
  assert.throws(
    () => findFoundAgents(() => scanWith([])),
    (error: unknown) =>
      error instanceof SelectionError && /no agents were found on this computer/.test(error.message),
  );
});
