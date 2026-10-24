import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { access, rm } from "node:fs/promises";
import { join } from "node:path";
import { Chalk } from "chalk";
import { AGENTS, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { UsageError } from "./install-command.ts";
import { SelectionError } from "./selection.ts";
import { InstallError } from "./skills/install.ts";
import { runUninstall, type UninstallCommandDeps } from "./uninstall-command.ts";
import { makeTempRoot, writeFiles } from "./test-support.ts";

const SKILL_MD = "---\nname: review-pr\ndescription: Reviews pull requests.\n---\n# Review\n";

interface Log {
  prompts: string[];
  progress: string[];
  output: string[];
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** Scan results where only `found` agents exist, each with the named skills installed. */
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

  return { results };
}

function destination(results: ScanResult[], id: AgentId, name: string): string {
  const result = results.find((candidate) => candidate.agent.id === id);

  assert.ok(result, `unknown agent ${id}`);

  return join(result.skillsDir, name);
}

/** Dependencies that record what happened. Prompts fail the test unless a test replaces them. */
function makeDeps(
  results: ScanResult[],
  overrides: Partial<UninstallCommandDeps> = {},
): { deps: UninstallCommandDeps; log: Log } {
  const log: Log = { prompts: [], progress: [], output: [] };
  const unexpected = (name: string) => async (): Promise<never> => {
    log.prompts.push(name);
    throw new Error(`unexpected prompt: ${name}`);
  };

  const deps: UninstallCommandDeps = {
    scan: () => results,
    interactive: true,
    colors: new Chalk({ level: 0 }),
    print: (line) => log.output.push(line),
    progress: {
      start: (text) => log.progress.push(`start: ${text}`),
      update: (text) => log.progress.push(`update: ${text}`),
      succeed: (text) => log.progress.push(`succeed: ${text}`),
      fail: (text) => log.progress.push(`fail: ${text}`),
    },
    prompts: {
      skill: unexpected("skill"),
      agents: unexpected("agents"),
      confirm: unexpected("confirm"),
    },
    ...overrides,
  };

  return { deps, log };
}

test("runUninstall asks for the skill, the agents and a confirmation, then removes the skill", async (t) => {
  const { results } = await setup(t, {
    claude: ["review-pr", "alpha"],
    cursor: ["review-pr"],
    gemini: ["review-pr"],
  });
  const { deps, log } = makeDeps(results);

  deps.prompts = {
    skill: async (skills) => {
      log.prompts.push(`skill: ${skills.map(({ name }) => name).join(", ")}`);

      return "review-pr";
    },
    agents: async (skill) => {
      log.prompts.push(`agents: ${skill.targets.map(({ agent }) => agent.id).join(", ")}`);

      return ["claude", "cursor"];
    },
    confirm: async (name, agentNames) => {
      log.prompts.push(`confirm: ${name} from ${agentNames.join(", ")}`);

      return true;
    },
  };

  await runUninstall(deps);

  assert.deepEqual(log.prompts, [
    "skill: alpha, review-pr",
    "agents: cursor, claude, gemini",
    "confirm: review-pr from Cursor, Claude",
  ]);
  assert.equal(await exists(destination(results, "claude", "review-pr")), false);
  assert.equal(await exists(destination(results, "cursor", "review-pr")), false);
  assert.equal(await exists(destination(results, "gemini", "review-pr")), true);
  assert.equal(await exists(destination(results, "claude", "alpha")), true);
  assert.deepEqual(log.progress, [
    "start: Removing review-pr...",
    "succeed: Removed review-pr from 2 agents",
  ]);
  assert.deepEqual(log.output, [
    `✔ Cursor  ${destination(results, "cursor", "review-pr")}`,
    `✔ Claude  ${destination(results, "claude", "review-pr")}`,
  ]);
});

test("runUninstall removes nothing when the confirmation is declined", async (t) => {
  const { results } = await setup(t, { claude: ["review-pr"] });
  const { deps, log } = makeDeps(results);

  deps.prompts = {
    skill: async () => "review-pr",
    agents: async () => ["claude"],
    confirm: async () => false,
  };

  await runUninstall(deps);

  assert.equal(await exists(destination(results, "claude", "review-pr")), true);
  assert.deepEqual(log.progress, []);
  assert.deepEqual(log.output, ["Cancelled. Nothing was removed."]);
});

test("runUninstall stops with an error when no agents were found", async (t) => {
  const { results } = await setup(t, {});
  const { deps, log } = makeDeps(results);

  await assert.rejects(
    runUninstall(deps),
    (error: unknown) =>
      error instanceof SelectionError && /no agents were found on this computer/.test(error.message),
  );
  assert.deepEqual(log.prompts, []);
});

test("runUninstall stops with an error instead of prompting when not in a terminal", async (t) => {
  const { results } = await setup(t, { claude: ["review-pr"] });
  const { deps, log } = makeDeps(results, { interactive: false });

  await assert.rejects(
    runUninstall(deps),
    (error: unknown) =>
      error instanceof UsageError && /needs a terminal/.test(error.message),
  );
  assert.deepEqual(log.prompts, []);
  assert.equal(await exists(destination(results, "claude", "review-pr")), true);
});

test("runUninstall says so and asks nothing when no skills are installed", async (t) => {
  const { results } = await setup(t, { claude: [], cursor: [] });
  const { deps, log } = makeDeps(results);

  await runUninstall(deps);

  assert.deepEqual(log.prompts, []);
  assert.deepEqual(log.output, ["No skills are installed in the agents that were found."]);
});

test("runUninstall says '1 agent' when the skill is removed from one agent", async (t) => {
  const { results } = await setup(t, { claude: ["review-pr"] });
  const { deps, log } = makeDeps(results);

  deps.prompts = {
    skill: async () => "review-pr",
    agents: async () => ["claude"],
    confirm: async () => true,
  };

  await runUninstall(deps);

  assert.deepEqual(log.progress, [
    "start: Removing review-pr...",
    "succeed: Removed review-pr from 1 agent",
  ]);
});

test("runUninstall fails the spinner and rethrows when the removal fails", async (t) => {
  const { results } = await setup(t, { claude: ["review-pr"] });
  const { deps, log } = makeDeps(results);

  deps.prompts = {
    skill: async () => "review-pr",
    agents: async () => ["claude"],
    confirm: async () => {
      await rm(destination(results, "claude", "review-pr"), { recursive: true });

      return true;
    },
  };

  await assert.rejects(
    runUninstall(deps),
    (error: unknown) => error instanceof InstallError && /not installed/.test(error.message),
  );
  assert.deepEqual(log.progress, [
    "start: Removing review-pr...",
    "fail: Could not remove review-pr",
  ]);
});

test("runUninstall stops with an error when no agent is chosen", async (t) => {
  const { results } = await setup(t, { claude: ["review-pr"] });
  const { deps, log } = makeDeps(results);

  deps.prompts = {
    skill: async () => "review-pr",
    agents: async () => [],
    confirm: async () => {
      log.prompts.push("confirm");

      return true;
    },
  };

  await assert.rejects(
    runUninstall(deps),
    (error: unknown) =>
      error instanceof SelectionError && /choose at least one agent/.test(error.message),
  );
  assert.deepEqual(log.prompts, []);
  assert.equal(await exists(destination(results, "claude", "review-pr")), true);
});

test("runUninstall stops with an error when the chosen skill is not in the list", async (t) => {
  const { results } = await setup(t, { claude: ["review-pr"] });
  const { deps } = makeDeps(results);

  deps.prompts = {
    skill: async () => "other-skill",
    agents: async () => ["claude"],
    confirm: async () => true,
  };

  await assert.rejects(
    runUninstall(deps),
    (error: unknown) =>
      error instanceof SelectionError && /other-skill is not one of the installed skills/.test(error.message),
  );
  assert.equal(await exists(destination(results, "claude", "review-pr")), true);
});
