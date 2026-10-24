import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Chalk } from "chalk";
import { AGENTS, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { runListSkills, type ListSkillsDeps } from "./list-skills-command.ts";
import { SelectionError } from "./selection.ts";
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

function makeDeps(results: ScanResult[]): { deps: ListSkillsDeps; output: string[] } {
  const output: string[] = [];
  const deps: ListSkillsDeps = {
    scan: () => results,
    print: (line) => output.push(line),
    colors: new Chalk({ level: 0 }),
  };

  return { deps, output };
}

test("runListSkills prints each installed skill with the agents that have it", async (t) => {
  const results = await setup(t, {
    claude: ["review-pr", "alpha"],
    cursor: ["review-pr"],
    gemini: [],
  });
  const { deps, output } = makeDeps(results);

  await runListSkills(deps);

  assert.deepEqual(output, ["alpha      Claude", "review-pr  Cursor, Claude"]);
});

test("runListSkills ignores skills in agents that were not found", async (t) => {
  const results = await setup(t, { claude: ["review-pr"] });
  const missing = results.find(({ agent }) => agent.id === "grok");

  assert.ok(missing);

  await writeFiles(join(missing.skillsDir, "hidden"), { "SKILL.md": SKILL_MD });

  const { deps, output } = makeDeps(results);

  await runListSkills(deps);

  assert.deepEqual(output, ["review-pr  Claude"]);
});

test("runListSkills stops with an error when no agents were found", async (t) => {
  const results = await setup(t, {});
  const { deps, output } = makeDeps(results);

  await assert.rejects(
    runListSkills(deps),
    (error: unknown) =>
      error instanceof SelectionError && /no agents were found on this computer/.test(error.message),
  );
  assert.deepEqual(output, []);
});

test("runListSkills says so when no skills are installed", async (t) => {
  const results = await setup(t, { claude: [], cursor: [] });
  const { deps, output } = makeDeps(results);

  await runListSkills(deps);

  assert.deepEqual(output, ["No skills are installed in the agents that were found."]);
});
