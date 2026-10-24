import { test } from "node:test";
import assert from "node:assert/strict";
import type { InstalledSkill } from "../skills/list.ts";
import { AGENTS, type AgentId } from "./registry.ts";
import type { ScanResult } from "./scan.ts";
import { summarizeAgents } from "./summary.ts";

function found(ids: AgentId[]): ScanResult[] {
  return ids.map((id) => {
    const agent = AGENTS.find((candidate) => candidate.id === id);

    assert.ok(agent, `unknown agent ${id}`);

    return { agent, found: true, skillsDir: `/home/.${id}/skills` };
  });
}

function skillsOn(entries: Record<string, AgentId[]>): InstalledSkill[] {
  return Object.entries(entries).map(([name, ids]) => ({
    name,
    targets: found(ids).map(({ agent, skillsDir }) => ({
      agent,
      skillsDir,
      installedAt: new Date(2026, 4, 9, 9, 5),
    })),
  }));
}

test("summarizeAgents counts the skills each agent has, in the order the agents were given", () => {
  const summaries = summarizeAgents(
    found(["cursor", "claude"]),
    skillsOn({ alpha: ["claude"], "review-pr": ["cursor", "claude"], beta: ["claude"] }),
  );

  assert.deepEqual(
    summaries.map(({ agent, skillCount }) => [agent.id, skillCount]),
    [
      ["cursor", 1],
      ["claude", 3],
    ],
  );
});

test("summarizeAgents counts zero for an agent with no skills", () => {
  const summaries = summarizeAgents(found(["cursor", "grok"]), skillsOn({ alpha: ["cursor"] }));

  assert.deepEqual(
    summaries.map(({ agent, skillCount }) => [agent.id, skillCount]),
    [
      ["cursor", 1],
      ["grok", 0],
    ],
  );
});

test("summarizeAgents keeps each agent's skills folder", () => {
  const [summary] = summarizeAgents(found(["claude"]), []);

  assert.equal(summary?.skillsDir, "/home/.claude/skills");
});
