import { test } from "node:test";
import assert from "node:assert/strict";
import { Chalk } from "chalk";
import { AGENTS, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import {
  formatAgentChoices,
  formatAgentDetails,
  formatAgentList,
  formatInstalledIn,
  formatSkillDetails,
  formatSkillList,
} from "./format.ts";
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

process.env.TZ = "America/Chicago";

const MAY_9 = new Date(2026, 4, 9, 9, 5);
const OCT_24 = new Date(2026, 9, 24, 17, 45);

function skillsOn(
  entries: Record<string, AgentId[]>,
  dates: Partial<Record<AgentId, Date>> = {},
): InstalledSkill[] {
  return Object.entries(entries).map(([name, ids]) => ({
    name,
    targets: ids.map((id) => {
      const agent = AGENTS.find((candidate) => candidate.id === id);

      assert.ok(agent, `unknown agent ${id}`);

      return { agent, skillsDir: `/home/.${id}/skills`, installedAt: dates[id] ?? MAY_9 };
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
    "  Cursor  2026-05-09T09:05-05:00  /home/.cursor/skills/review-pr",
    "  Claude  2026-05-09T09:05-05:00  /home/.claude/skills/review-pr",
  ]);
});

test("formatSkillDetails lines up the dates and folders, dims the date and colors the folder cyan", () => {
  const [skill] = skillsOn({ alpha: ["chatgpt", "claude"] });

  assert.ok(skill);
  assert.deepEqual(formatSkillDetails(skill, colored), [
    "alpha",
    `  ChatGPT  ${colored.dim("2026-05-09T09:05-05:00")}  ${colored.cyan("/home/.chatgpt/skills/alpha")}`,
    `  Claude   ${colored.dim("2026-05-09T09:05-05:00")}  ${colored.cyan("/home/.claude/skills/alpha")}`,
  ]);
});

test("formatSkillDetails shows each agent's own date", () => {
  const [skill] = skillsOn({ alpha: ["cursor", "claude"] }, { cursor: OCT_24 });

  assert.ok(skill);
  assert.deepEqual(formatSkillDetails(skill, plain), [
    "alpha",
    "  Cursor  2026-10-24T17:45-05:00  /home/.cursor/skills/alpha",
    "  Claude  2026-05-09T09:05-05:00  /home/.claude/skills/alpha",
  ]);
});

test("formatInstalledIn names the agent and the date", () => {
  const [skill] = skillsOn({ alpha: ["claude"] });

  assert.ok(skill);
  assert.equal(formatInstalledIn(skill), "Installed in Claude on 2026-05-09T09:05-05:00");
});

test("formatInstalledIn gives the date once when every agent has the same one", () => {
  const [skill] = skillsOn({ alpha: ["cursor", "claude"] });

  assert.ok(skill);
  assert.equal(formatInstalledIn(skill), "Installed in Cursor, Claude on 2026-05-09T09:05-05:00");
});

test("formatInstalledIn groups the agents that share a date when the dates differ", () => {
  const [skill] = skillsOn(
    { alpha: ["cursor", "claude", "chatgpt"] },
    { cursor: OCT_24, claude: OCT_24 },
  );

  assert.ok(skill);
  assert.equal(
    formatInstalledIn(skill),
    "Installed in Cursor, Claude on 2026-10-24T17:45-05:00; ChatGPT on 2026-05-09T09:05-05:00",
  );
});

function targetOf(id: AgentId) {
  const agent = AGENTS.find((candidate) => candidate.id === id);

  assert.ok(agent, `unknown agent ${id}`);

  return { agent, skillsDir: `/home/.${id}/skills` };
}

test("formatAgentDetails prints the skills folder, then the agent's skills with the date of its own copy", () => {
  const skills = skillsOn({ alpha: ["claude"], "review-pr": ["claude", "cursor"] }, { cursor: OCT_24 });

  assert.deepEqual(formatAgentDetails(targetOf("claude"), skills, plain), [
    "Claude  /home/.claude/skills",
    "  alpha      2026-05-09T09:05-05:00",
    "  review-pr  2026-05-09T09:05-05:00",
  ]);
  assert.deepEqual(formatAgentDetails(targetOf("cursor"), skills, plain), [
    "Cursor  /home/.cursor/skills",
    "  review-pr  2026-10-24T17:45-05:00",
  ]);
});

test("formatAgentDetails says so when the agent has no skills", () => {
  assert.deepEqual(formatAgentDetails(targetOf("grok"), [], plain), [
    "Grok  /home/.grok/skills",
    "  No skills installed",
  ]);
});

test("formatAgentDetails colors the folder cyan and dims the dates and the empty message", () => {
  const skills = skillsOn({ alpha: ["claude"] });

  assert.deepEqual(formatAgentDetails(targetOf("claude"), skills, colored), [
    `Claude  ${colored.cyan("/home/.claude/skills")}`,
    `  alpha  ${colored.dim("2026-05-09T09:05-05:00")}`,
  ]);
  assert.deepEqual(formatAgentDetails(targetOf("grok"), [], colored), [
    `Grok  ${colored.cyan("/home/.grok/skills")}`,
    `  ${colored.dim("No skills installed")}`,
  ]);
});

test("formatAgentChoices lines up the agent names and counts the skills, with a singular for one", () => {
  const choices = formatAgentChoices([
    { ...targetOf("cursor"), skillCount: 1 },
    { ...targetOf("claude"), skillCount: 8 },
    { ...targetOf("chatgpt"), skillCount: 0 },
  ]);

  assert.deepEqual(choices, ["Cursor   1 skill", "Claude   8 skills", "ChatGPT  0 skills"]);
});
