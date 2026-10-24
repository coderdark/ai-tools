import { test } from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { AGENTS, type AgentId } from "../agents/registry.ts";
import { InstallError, type InstallTarget } from "./install.ts";
import { uninstallSkill } from "./uninstall.ts";
import { makeTempRoot, writeFiles } from "../test-support.ts";

const SKILL_MD = "---\nname: review-pr\ndescription: Reviews pull requests.\n---\n# Review\n";

function target(id: AgentId, skillsDir: string): InstallTarget {
  const agent = AGENTS.find((candidate) => candidate.id === id);

  assert.ok(agent, `unknown agent ${id}`);

  return { agent, skillsDir };
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

test("uninstallSkill removes the whole skill folder from each chosen agent", async (t) => {
  const home = await makeTempRoot(t, "ai-toolbox-home-");
  const claudeSkills = join(home, ".claude", "skills");
  const cursorSkills = join(home, ".cursor", "skills");

  await writeFiles(join(claudeSkills, "review-pr"), {
    "SKILL.md": SKILL_MD,
    "scripts/run.sh": "echo hi\n",
  });
  await writeFiles(join(cursorSkills, "review-pr"), { "SKILL.md": SKILL_MD });

  const outcomes = await uninstallSkill("review-pr", [
    target("claude", claudeSkills),
    target("cursor", cursorSkills),
  ]);

  assert.deepEqual(
    outcomes.map((outcome) => [outcome.agent.id, outcome.destination]),
    [
      ["claude", join(claudeSkills, "review-pr")],
      ["cursor", join(cursorSkills, "review-pr")],
    ],
  );
  assert.equal(await exists(join(claudeSkills, "review-pr")), false);
  assert.equal(await exists(join(cursorSkills, "review-pr")), false);
});

test("uninstallSkill refuses a name that could point outside the skills folder", async (t) => {
  const home = await makeTempRoot(t, "ai-toolbox-home-");
  const claudeSkills = join(home, ".claude", "skills");

  await writeFiles(claudeSkills, { "review-pr/SKILL.md": SKILL_MD });
  await writeFiles(join(home, ".claude"), { "settings.json": "{}\n" });

  for (const name of ["..", "../skills", "a/b", ""]) {
    await assert.rejects(
      uninstallSkill(name, [target("claude", claudeSkills)]),
      (error: unknown) => error instanceof InstallError && /invalid name/.test(error.message),
    );
  }

  assert.equal(await exists(join(claudeSkills, "review-pr", "SKILL.md")), true);
  assert.equal(await exists(join(home, ".claude", "settings.json")), true);
});

test("uninstallSkill deletes nothing when a folder is missing or has no SKILL.md", async (t) => {
  const home = await makeTempRoot(t, "ai-toolbox-home-");
  const claudeSkills = join(home, ".claude", "skills");
  const cursorSkills = join(home, ".cursor", "skills");
  const grokSkills = join(home, ".grok", "skills");

  await writeFiles(join(claudeSkills, "review-pr"), { "SKILL.md": SKILL_MD });
  await writeFiles(join(cursorSkills, "review-pr"), { "notes.md": "not a skill\n" });

  await assert.rejects(
    uninstallSkill("review-pr", [target("claude", claudeSkills), target("cursor", cursorSkills)]),
    (error: unknown) => error instanceof InstallError && /Cursor.*no SKILL\.md/s.test(error.message),
  );
  await assert.rejects(
    uninstallSkill("review-pr", [target("claude", claudeSkills), target("grok", grokSkills)]),
    (error: unknown) => error instanceof InstallError && /Grok.*not installed/s.test(error.message),
  );

  assert.equal(await exists(join(claudeSkills, "review-pr", "SKILL.md")), true);
  assert.equal(await exists(join(cursorSkills, "review-pr", "notes.md")), true);
});
