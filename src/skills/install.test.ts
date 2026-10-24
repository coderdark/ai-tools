import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENTS, type AgentId } from "../agents/registry.ts";
import { InstallError, installSkill, type InstallTarget } from "./install.ts";
import { readSkill } from "./skill.ts";
import { makeSkillDir, makeTempRoot, writeFiles } from "../test-support.ts";

const SKILL_MD = "---\nname: review-pr\ndescription: Reviews pull requests.\n---\n# Review\n";

function target(id: AgentId, skillsDir: string): InstallTarget {
  const agent = AGENTS.find((candidate) => candidate.id === id);

  assert.ok(agent, `unknown agent ${id}`);

  return { agent, skillsDir };
}

async function setup(t: TestContext, files: Record<string, string> = {}) {
  const dir = await makeSkillDir(t, "review-pr", { "SKILL.md": SKILL_MD, ...files });
  const skill = await readSkill(dir);
  const home = await makeTempRoot(t, "ai-toolbox-home-");

  return { skill, home };
}

test("installSkill copies the whole folder into <skillsDir>/<name> and keeps the source", async (t) => {
  const { skill, home } = await setup(t, { "scripts/run.sh": "echo hi\n" });
  const skillsDir = join(home, ".claude", "skills");

  const outcomes = await installSkill(skill, [target("claude", skillsDir)]);

  const destination = join(skillsDir, "review-pr");

  assert.deepEqual(
    outcomes.map((outcome) => [outcome.agent.id, outcome.destination]),
    [["claude", destination]],
  );
  assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), SKILL_MD);
  assert.equal(await readFile(join(destination, "scripts", "run.sh"), "utf8"), "echo hi\n");
  assert.equal(await readFile(join(skill.dir, "SKILL.md"), "utf8"), SKILL_MD);
});

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

function rejectsWith(message: RegExp): (error: unknown) => boolean {
  return (error) => error instanceof InstallError && message.test(error.message);
}

test("installSkill copies nothing when any destination already exists", async (t) => {
  const { skill, home } = await setup(t);
  const claudeSkills = join(home, ".claude", "skills");
  const cursorSkills = join(home, ".cursor", "skills");

  await writeFiles(join(cursorSkills, "review-pr"), { "old.md": "keep me\n" });

  await assert.rejects(
    installSkill(skill, [target("claude", claudeSkills), target("cursor", cursorSkills)]),
    rejectsWith(/Cursor.*already exists/s),
  );

  assert.equal(await exists(join(claudeSkills, "review-pr")), false);
  assert.equal(await readFile(join(cursorSkills, "review-pr", "old.md"), "utf8"), "keep me\n");
  assert.equal(await exists(join(cursorSkills, "review-pr", "SKILL.md")), false);
});

test("installSkill with force replaces only that destination", async (t) => {
  const { skill, home } = await setup(t);
  const skillsDir = join(home, ".codex", "skills");

  await writeFiles(join(skillsDir, "review-pr"), { "stale.md": "old\n", "SKILL.md": "old\n" });
  await writeFiles(join(skillsDir, "other-skill"), { "SKILL.md": "untouched\n" });

  await installSkill(skill, [target("chatgpt", skillsDir)], { force: true });

  const destination = join(skillsDir, "review-pr");

  assert.equal(await exists(join(destination, "stale.md")), false);
  assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), SKILL_MD);
  assert.equal(await readFile(join(skillsDir, "other-skill", "SKILL.md"), "utf8"), "untouched\n");
});

test("installSkill refuses to install a skill onto itself, even with force", async (t) => {
  const home = await makeTempRoot(t, "ai-toolbox-home-");
  const skillsDir = join(home, ".claude", "skills");
  const source = join(skillsDir, "review-pr");

  await writeFiles(source, { "SKILL.md": SKILL_MD });

  const skill = await readSkill(source);

  await assert.rejects(
    installSkill(skill, [target("claude", skillsDir)], { force: true }),
    rejectsWith(/same folder/),
  );
  await assert.rejects(
    installSkill(skill, [target("claude", skillsDir)]),
    rejectsWith(/same folder/),
  );

  assert.equal(await readFile(join(source, "SKILL.md"), "utf8"), SKILL_MD);
});

test("installSkill rolls back earlier copies when a later target fails", async (t) => {
  const { skill, home } = await setup(t);
  const claudeSkills = join(home, ".claude", "skills");

  // A regular file where Cursor's parent folder should be makes that copy fail.
  await writeFiles(home, { "blocked": "not a folder\n" });

  const cursorSkills = join(home, "blocked", "skills");

  await assert.rejects(
    installSkill(skill, [target("claude", claudeSkills), target("cursor", cursorSkills)]),
    rejectsWith(/Cursor.*rolled back/s),
  );

  assert.equal(await exists(join(claudeSkills, "review-pr")), false);
});

test("installSkill reports each target through onProgress before copying it", async (t) => {
  const { skill, home } = await setup(t);
  const claudeSkills = join(home, ".claude", "skills");
  const geminiSkills = join(home, ".gemini", "skills");
  const seen: Array<[string, boolean]> = [];

  await installSkill(skill, [target("claude", claudeSkills), target("gemini", geminiSkills)], {
    onProgress: async ({ agent, destination }) => {
      seen.push([agent.id, await exists(destination)]);
    },
  });

  assert.deepEqual(seen, [
    ["claude", false],
    ["gemini", false],
  ]);
});

test("installSkill does not copy .git folders", async (t) => {
  const { skill, home } = await setup(t, {
    ".git/config": "[core]\n",
    "references/.git/HEAD": "ref: refs/heads/main\n",
    "references/guide.md": "# Guide\n",
  });
  const skillsDir = join(home, ".cursor", "skills");

  await installSkill(skill, [target("cursor", skillsDir)]);

  const destination = join(skillsDir, "review-pr");

  assert.equal(await exists(join(destination, ".git")), false);
  assert.equal(await exists(join(destination, "references", ".git")), false);
  assert.equal(await exists(join(destination, "references", "guide.md")), true);
});
