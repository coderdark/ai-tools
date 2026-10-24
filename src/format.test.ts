import { test } from "node:test";
import assert from "node:assert/strict";
import { Chalk } from "chalk";
import { AGENTS, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { formatAgentList, formatSkillDetails, formatSkillList } from "./format.ts";
import type { InstalledSkill } from "./skills/list.ts";

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

function skillsOn(entries: Record<string, AgentId[]>): InstalledSkill[] {
  return Object.entries(entries).map(([name, ids]) => ({
    name,
    targets: ids.map((id) => {
      const agent = AGENTS.find((candidate) => candidate.id === id);

      assert.ok(agent, `unknown agent ${id}`);

      return { agent, skillsDir: `/home/.${id}/skills` };
    }),
  }));
}

test("formatSkillList prints one line per skill with the agents that have it", () => {
  const lines = formatSkillList(
    skillsOn({ alpha: ["claude"], "review-pr": ["cursor", "claude"] }),
    plain,
  );

  assert.deepEqual(lines, ["alpha      Claude", "review-pr  Cursor, Claude"]);
});

test("formatSkillList dims the agent names", () => {
  const [line] = formatSkillList(skillsOn({ "review-pr": ["cursor", "claude"] }), colored);

  assert.equal(line, `review-pr  ${colored.dim("Cursor, Claude")}`);
});

test("formatSkillDetails prints the skill name, then each agent with the skill's folder", () => {
  const [skill] = skillsOn({ "review-pr": ["cursor", "claude"] });

  assert.ok(skill);
  assert.deepEqual(formatSkillDetails(skill, plain), [
    "review-pr",
    "  Cursor  /home/.cursor/skills/review-pr",
    "  Claude  /home/.claude/skills/review-pr",
  ]);
});

test("formatSkillDetails lines up the folders and colors them cyan", () => {
  const [skill] = skillsOn({ alpha: ["chatgpt", "claude"] });

  assert.ok(skill);
  assert.deepEqual(formatSkillDetails(skill, colored), [
    "alpha",
    `  ChatGPT  ${colored.cyan("/home/.chatgpt/skills/alpha")}`,
    `  Claude   ${colored.cyan("/home/.claude/skills/alpha")}`,
  ]);
});
