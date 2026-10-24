import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Chalk } from "chalk";
import { AGENTS, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import {
  runBrowseAgents,
  type BrowseAgentsDeps,
  type BrowseAgentsPrompts,
} from "./browse-agents-command.ts";
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

interface Recorded {
  output: string[];
  listsShown: AgentId[][];
}

/** Each entry of `picks` is the agent the user chooses on one pass; `undefined` is Esc. */
function makeDeps(
  results: ScanResult[],
  picks: (AgentId | undefined)[],
): { deps: BrowseAgentsDeps; recorded: Recorded } {
  const recorded: Recorded = { output: [], listsShown: [] };
  const remaining = [...picks];
  const prompts: BrowseAgentsPrompts = {
    async agent(found: ScanResult[]) {
      recorded.listsShown.push(found.map(({ agent }) => agent.id));

      const pick = remaining.shift();

      return found.find(({ agent }) => agent.id === pick);
    },
  };
  const deps: BrowseAgentsDeps = {
    scan: () => results,
    prompts,
    print: (line) => recorded.output.push(line),
    colors: new Chalk({ level: 0 }),
  };

  return { deps, recorded };
}

function withoutDates(lines: string[]): string[] {
  return lines.map((line) => line.replace(/\d{4}-\d{2}-\d{2}/, "<date>"));
}

test("runBrowseAgents offers only the agents that were found", async (t) => {
  const results = await setup(t, { claude: [], cursor: [] });
  const { deps, recorded } = makeDeps(results, [undefined]);

  await runBrowseAgents(deps);

  assert.deepEqual(recorded.listsShown, [["cursor", "claude"]]);
});

test("runBrowseAgents prints nothing when the user leaves without choosing", async (t) => {
  const results = await setup(t, { claude: ["alpha"] });
  const { deps, recorded } = makeDeps(results, [undefined]);

  await runBrowseAgents(deps);

  assert.deepEqual(recorded.output, []);
});

test("runBrowseAgents shows the chosen agent's skills with their dates and does not offer the list again", async (t) => {
  const results = await setup(t, { claude: ["review-pr", "alpha"], cursor: ["review-pr"] });
  const { deps, recorded } = makeDeps(results, ["claude", "cursor", undefined]);
  const claude = results.find(({ agent }) => agent.id === "claude");

  assert.ok(claude);

  await runBrowseAgents(deps);

  assert.deepEqual(withoutDates(recorded.output), [
    `Claude  ${claude.skillsDir}`,
    "  alpha      <date>",
    "  review-pr  <date>",
  ]);
  assert.equal(recorded.listsShown.length, 1);
});

test("runBrowseAgents says so when the chosen agent has no skills", async (t) => {
  const results = await setup(t, { claude: [] });
  const { deps, recorded } = makeDeps(results, ["claude", undefined]);
  const claude = results.find(({ agent }) => agent.id === "claude");

  assert.ok(claude);

  await runBrowseAgents(deps);

  assert.deepEqual(recorded.output, [`Claude  ${claude.skillsDir}`, "  No skills installed"]);
});

test("runBrowseAgents stops with an error, without asking, when no agents were found", async (t) => {
  const results = await setup(t, {});
  const { deps, recorded } = makeDeps(results, []);

  await assert.rejects(
    runBrowseAgents(deps),
    (error: unknown) =>
      error instanceof SelectionError && /no agents were found on this computer/.test(error.message),
  );
  assert.deepEqual(recorded.listsShown, []);
});
