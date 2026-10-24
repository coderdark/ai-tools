import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readSkill, SkillError } from "./skill.ts";
import { makeSkillDir } from "../test-support.ts";

test("readSkill reads the name and description from the SKILL.md frontmatter", async (t) => {
  const dir = await makeSkillDir(t, "review-pr", {
    "SKILL.md": "---\nname: review-pr\ndescription: Reviews pull requests.\n---\n# Review\n",
  });

  const skill = await readSkill(dir);

  assert.deepEqual(skill, {
    name: "review-pr",
    description: "Reviews pull requests.",
    dir,
  });
});

test("readSkill uses the folder name when the frontmatter has no name", async (t) => {
  const dir = await makeSkillDir(t, "plan-work", {
    "SKILL.md": "---\ndescription: Plans work.\n---\n# Plan\n",
  });

  const skill = await readSkill(dir);

  assert.equal(skill.name, "plan-work");
});

function rejectsWith(message: RegExp): (error: unknown) => boolean {
  return (error) => error instanceof SkillError && message.test(error.message);
}

test("readSkill rejects a folder that has no SKILL.md", async (t) => {
  const dir = await makeSkillDir(t, "empty-skill", { "README.md": "hello" });

  await assert.rejects(readSkill(dir), rejectsWith(/no SKILL\.md/));
});

test("readSkill rejects a path that is a file or does not exist", async (t) => {
  const dir = await makeSkillDir(t, "a-skill", { "SKILL.md": "---\nname: a-skill\n---\n" });

  await assert.rejects(readSkill(join(dir, "SKILL.md")), rejectsWith(/not a directory/));
  await assert.rejects(readSkill(join(dir, "missing")), rejectsWith(/not a directory/));
});

test("readSkill rejects names that are not lowercase letters, numbers, and hyphens", async (t) => {
  const badNames = ["Review PR", "bad_name", "UPPER", "has.dot", "a".repeat(65)];

  for (const name of badNames) {
    const dir = await makeSkillDir(t, "folder", {
      "SKILL.md": `---\nname: "${name}"\ndescription: Something.\n---\n`,
    });

    await assert.rejects(readSkill(dir), rejectsWith(/invalid name/));
  }
});

test("readSkill requires a non-empty description", async (t) => {
  const cases = [
    "---\nname: no-description\n---\n",
    "---\nname: blank\ndescription: \"   \"\n---\n",
    "# No frontmatter at all\n",
  ];

  for (const contents of cases) {
    const dir = await makeSkillDir(t, "folder", { "SKILL.md": contents });

    await assert.rejects(readSkill(dir), rejectsWith(/description/));
  }
});

// Boundary guard: the longest allowed name is 64 characters.
test("readSkill accepts a 64-character name with numbers and hyphens", async (t) => {
  const name = `a1-${"b".repeat(61)}`;
  const dir = await makeSkillDir(t, "folder", {
    "SKILL.md": `---\nname: ${name}\ndescription: Something.\n---\n`,
  });

  const skill = await readSkill(dir);

  assert.equal(skill.name, name);
  assert.equal(name.length, 64);
});

// Regression guard: real skills write long descriptions as folded blocks.
test("readSkill joins a folded >- description into one line", async (t) => {
  const dir = await makeSkillDir(t, "folded", {
    "SKILL.md": "---\nname: folded\ndescription: >-\n  First part\n  second part.\n---\n",
  });

  const skill = await readSkill(dir);

  assert.equal(skill.description, "First part second part.");
});
