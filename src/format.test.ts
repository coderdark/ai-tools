import { test } from "node:test";
import assert from "node:assert/strict";
import { Chalk } from "chalk";
import { AGENTS, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { formatAgentList } from "./format.ts";

const plain = new Chalk({ level: 0 });
const colored = new Chalk({ level: 1 });

function scanWith(found: AgentId[]): ScanResult[] {
  return AGENTS.map((agent) => ({
    agent,
    found: found.includes(agent.id),
    skillsDir: `/home/.${agent.id}/skills`,
  }));
}

test("formatAgentList prints one line per agent with its status and skills directory", () => {
  const lines = formatAgentList(scanWith(["cursor", "chatgpt"]), plain);

  assert.deepEqual(lines, [
    "found    Cursor   /home/.cursor/skills",
    "missing  Claude   /home/.claude/skills",
    "found    ChatGPT  /home/.chatgpt/skills",
    "missing  Gemini   /home/.gemini/skills",
    "missing  Grok     /home/.grok/skills",
  ]);
});

test("formatAgentList colors found agents green with a cyan path, and dims missing agents", () => {
  const [found, missing] = formatAgentList(scanWith(["cursor"]), colored);

  assert.equal(
    found,
    `${colored.green("found  ")}  Cursor   ${colored.cyan("/home/.cursor/skills")}`,
  );
  assert.equal(missing, colored.dim("missing  Claude   /home/.claude/skills"));
});
