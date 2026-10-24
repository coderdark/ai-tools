import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENTS } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { ALL_AGENTS, buildAgentChoices, toSelectionRequest } from "./agent-choices.ts";

function foundResult(id: string): ScanResult {
  const agent = AGENTS.find((candidate) => candidate.id === id);

  assert.ok(agent, `unknown agent ${id}`);

  return { agent, found: true, skillsDir: `/home/${id}/skills` };
}

test("buildAgentChoices puts an All row first, followed by one row per found agent", () => {
  const choices = buildAgentChoices([foundResult("cursor"), foundResult("claude")]);

  assert.deepEqual(choices, [
    { name: "All agents", value: ALL_AGENTS },
    { name: "Cursor", value: "cursor", description: "/home/cursor/skills" },
    { name: "Claude", value: "claude", description: "/home/claude/skills" },
  ]);
});

test("toSelectionRequest asks for all agents when the All row is selected, even with others", () => {
  assert.deepEqual(toSelectionRequest([ALL_AGENTS]), { all: true });
  assert.deepEqual(toSelectionRequest(["cursor", ALL_AGENTS]), { all: true });
});

test("toSelectionRequest names the chosen agents when All is not selected", () => {
  assert.deepEqual(toSelectionRequest(["cursor", "claude"]), { agents: ["cursor", "claude"] });
});
