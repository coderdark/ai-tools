import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { AGENTS, type AgentId } from "../agents/registry.ts";
import type { InstallTarget } from "./install.ts";
import { listInstalledSkills } from "./list.ts";
import { makeTempRoot, writeFiles } from "../test-support.ts";

const SKILL_MD = "---\nname: review-pr\ndescription: Reviews pull requests.\n---\n# Review\n";

function target(id: AgentId, skillsDir: string): InstallTarget {
  const agent = AGENTS.find((candidate) => candidate.id === id);

  assert.ok(agent, `unknown agent ${id}`);

  return { agent, skillsDir };
}

test("listInstalledSkills treats an agent with no skills folder as having no skills", async (t) => {
  const home = await makeTempRoot(t, "ai-toolbox-home-");
  const claudeSkills = join(home, ".claude", "skills");

  await writeFiles(claudeSkills, { "review-pr/SKILL.md": SKILL_MD });

  const skills = await listInstalledSkills([
    target("claude", claudeSkills),
    target("grok", join(home, ".grok", "skills")),
  ]);

  assert.deepEqual(
    skills.map((skill) => [skill.name, skill.targets.map(({ agent }) => agent.id)]),
    [["review-pr", ["claude"]]],
  );
});

test("listInstalledSkills skips files, folders without SKILL.md and names that are not valid", async (t) => {
  const home = await makeTempRoot(t, "ai-toolbox-home-");
  const claudeSkills = join(home, ".claude", "skills");

  await writeFiles(claudeSkills, {
    "review-pr/SKILL.md": SKILL_MD,
    "notes/readme.md": "not a skill\n",
    ".system/SKILL.md": SKILL_MD,
    "Not_Valid/SKILL.md": SKILL_MD,
    "loose-file.md": "just a file\n",
  });

  const skills = await listInstalledSkills([target("claude", claudeSkills)]);

  assert.deepEqual(
    skills.map((skill) => skill.name),
    ["review-pr"],
  );
});

test("listInstalledSkills groups skills by name across agents, sorted by name", async (t) => {
  const home = await makeTempRoot(t, "ai-toolbox-home-");
  const claudeSkills = join(home, ".claude", "skills");
  const cursorSkills = join(home, ".cursor", "skills");

  await writeFiles(claudeSkills, {
    "review-pr/SKILL.md": SKILL_MD,
    "alpha/SKILL.md": SKILL_MD,
  });
  await writeFiles(cursorSkills, { "review-pr/SKILL.md": SKILL_MD });

  const skills = await listInstalledSkills([
    target("claude", claudeSkills),
    target("cursor", cursorSkills),
  ]);

  assert.deepEqual(
    skills.map((skill) => [skill.name, skill.targets.map(({ agent }) => agent.id)]),
    [
      ["alpha", ["claude"]],
      ["review-pr", ["claude", "cursor"]],
    ],
  );
});
