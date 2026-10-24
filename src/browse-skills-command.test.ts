import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Chalk } from "chalk";
import { AGENTS, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import {
  runBrowseSkills,
  type BrowseSkillsDeps,
  type BrowseSkillsPrompts,
} from "./browse-skills-command.ts";
import { SelectionError } from "./selection.ts";
import type { InstalledSkill } from "./skills/list.ts";
import { makeTempRoot, writeFiles } from "./test-support.ts";

const SKILL_MD = "---\nname: review-pr\ndescription: Reviews pull requests.\n---\n# Review\n";

/** Scan results where only the listed agents exist, each with the named skills installed. */
async function setup(t: TestContext, installed: Partial<Record<AgentId, string[]>>) {
  const home = await makeTempRoot(t, "ai-toolbox-home-");
  const results: ScanResult[] = AGENTS.map((agent) => ({
    agent,
    found: agent.id in installed,
    skillsDir: join(home, ...agent.skillsDir),
  }));

  for (const result of results) {
    for (const name of installed[result.agent.id] ?? []) {
      await writeFiles(join(result.skillsDir, name), { "SKILL.md": SKILL_MD });
    }
  }

  return results;
}

interface Recorded {
  output: string[];
  listsShown: string[][];
}

/** Each entry of `picks` is the skill the user chooses on one pass; `undefined` is Back. */
function makeDeps(
  results: ScanResult[],
  picks: (string | undefined)[],
): { deps: BrowseSkillsDeps; recorded: Recorded } {
  const recorded: Recorded = { output: [], listsShown: [] };
  const remaining = [...picks];
  const prompts: BrowseSkillsPrompts = {
    async skill(skills: InstalledSkill[]) {
      recorded.listsShown.push(skills.map(({ name }) => name));

      const pick = remaining.shift();

      return skills.find(({ name }) => name === pick);
    },
  };
  const deps: BrowseSkillsDeps = {
    scan: () => results,
    prompts,
    print: (line) => recorded.output.push(line),
    colors: new Chalk({ level: 0 }),
  };

  return { deps, recorded };
}

test("runBrowseSkills offers the installed skills in alphabetical order", async (t) => {
  const results = await setup(t, { claude: ["review-pr", "alpha"], cursor: ["review-pr"] });
  const { deps, recorded } = makeDeps(results, [undefined]);

  await runBrowseSkills(deps);

  assert.deepEqual(recorded.listsShown, [["alpha", "review-pr"]]);
});

test("runBrowseSkills prints nothing when the user leaves without choosing", async (t) => {
  const results = await setup(t, { claude: ["alpha"] });
  const { deps, recorded } = makeDeps(results, [undefined]);

  await runBrowseSkills(deps);

  assert.deepEqual(recorded.output, []);
});

test("runBrowseSkills shows the details of the chosen skill and does not offer the list again", async (t) => {
  const results = await setup(t, { claude: ["review-pr", "alpha"], cursor: ["review-pr"] });
  const { deps, recorded } = makeDeps(results, ["review-pr", "alpha", undefined]);
  const claude = results.find(({ agent }) => agent.id === "claude");
  const cursor = results.find(({ agent }) => agent.id === "cursor");

  assert.ok(claude && cursor);

  await runBrowseSkills(deps);

  const withoutDates = recorded.output.map((line) => line.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}[+-]\d{2}:\d{2}/, "<date>"));

  assert.deepEqual(withoutDates, [
    "review-pr",
    `  Cursor  <date>  ${join(cursor.skillsDir, "review-pr")}`,
    `  Claude  <date>  ${join(claude.skillsDir, "review-pr")}`,
  ]);
  assert.equal(recorded.listsShown.length, 1);
});

test("runBrowseSkills says so, without asking, when no skills are installed", async (t) => {
  const results = await setup(t, { claude: [], cursor: [] });
  const { deps, recorded } = makeDeps(results, []);

  await runBrowseSkills(deps);

  assert.deepEqual(recorded.output, ["No skills are installed in the agents that were found."]);
  assert.deepEqual(recorded.listsShown, []);
});

test("runBrowseSkills stops with an error when no agents were found", async (t) => {
  const results = await setup(t, {});
  const { deps, recorded } = makeDeps(results, []);

  await assert.rejects(
    runBrowseSkills(deps),
    (error: unknown) =>
      error instanceof SelectionError && /no agents were found on this computer/.test(error.message),
  );
  assert.deepEqual(recorded.output, []);
});
