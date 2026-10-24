import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Chalk } from "chalk";
import { AGENTS, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { runInstall, UsageError, type InstallCommandDeps } from "./install-command.ts";
import { SelectionError } from "./selection.ts";
import { InstallError } from "./skills/install.ts";
import { makeSkillDir, makeTempRoot, writeFiles } from "./test-support.ts";

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

/** A skill folder, plus scan results where only `found` agents exist under a temporary home. */
async function setup(t: TestContext, found: AgentId[]) {
  const skillDir = await makeSkillDir(t, "review-pr", { "SKILL.md": SKILL_MD });
  const home = await makeTempRoot(t, "ai-toolbox-home-");
  const results: ScanResult[] = AGENTS.map((agent) => ({
    agent,
    found: found.includes(agent.id),
    skillsDir: join(home, ...agent.skillsDir),
  }));

  return { skillDir, home, results };
}

function destination(results: ScanResult[], id: AgentId): string {
  const result = results.find((candidate) => candidate.agent.id === id);

  assert.ok(result, `unknown agent ${id}`);

  return join(result.skillsDir, "review-pr");
}

/** Dependencies that record what happened. Prompts fail the test unless a test replaces them. */
function makeDeps(
  results: ScanResult[],
  overrides: Partial<InstallCommandDeps> = {},
): { deps: InstallCommandDeps; log: Log } {
  const log: Log = { prompts: [], progress: [], output: [] };
  const unexpected = (name: string) => async (): Promise<never> => {
    log.prompts.push(name);
    throw new Error(`unexpected prompt: ${name}`);
  };

  const deps: InstallCommandDeps = {
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
      skillDir: unexpected("skillDir"),
      agents: unexpected("agents"),
      confirm: unexpected("confirm"),
    },
    ...overrides,
  };

  return { deps, log };
}

test("runInstall installs into the named agents without prompting when flags and --yes are given", async (t) => {
  const { skillDir, results } = await setup(t, ["claude", "chatgpt", "gemini"]);
  const { deps, log } = makeDeps(results);

  await runInstall({ skillDir, agents: ["claude", "chatgpt"], yes: true }, deps);

  assert.equal(await exists(destination(results, "claude")), true);
  assert.equal(await exists(destination(results, "chatgpt")), true);
  assert.equal(await exists(destination(results, "gemini")), false);
  assert.deepEqual(log.prompts, []);
  assert.deepEqual(log.progress, [
    "start: Installing review-pr...",
    "update: Installing review-pr into Claude...",
    "update: Installing review-pr into ChatGPT...",
    "succeed: Installed review-pr into 2 agents",
  ]);
  assert.deepEqual(log.output, [
    `✔ Claude   ${destination(results, "claude")}`,
    `✔ ChatGPT  ${destination(results, "chatgpt")}`,
  ]);
});

test("runInstall asks for the skill folder, the agents and a confirmation when no flags are given", async (t) => {
  const { skillDir, results } = await setup(t, ["claude", "gemini"]);
  const { deps, log } = makeDeps(results);

  deps.prompts = {
    skillDir: async () => {
      log.prompts.push("skillDir");

      return skillDir;
    },
    agents: async (found) => {
      log.prompts.push(`agents: ${found.map(({ agent }) => agent.name).join(", ")}`);

      return { agents: ["claude"] };
    },
    confirm: async (skill, agentNames) => {
      log.prompts.push(`confirm: ${skill.name} -> ${agentNames.join(", ")}`);

      return true;
    },
  };

  await runInstall({}, deps);

  assert.deepEqual(log.prompts, [
    "skillDir",
    "agents: Claude, Gemini",
    "confirm: review-pr -> Claude",
  ]);
  assert.equal(await exists(destination(results, "claude")), true);
  assert.equal(await exists(destination(results, "gemini")), false);
});

test("runInstall copies nothing and says so when the user declines the confirmation", async (t) => {
  const { skillDir, results } = await setup(t, ["claude"]);
  const { deps, log } = makeDeps(results);

  deps.prompts = { ...deps.prompts, confirm: async () => false };

  await runInstall({ skillDir, agents: ["claude"] }, deps);

  assert.equal(await exists(destination(results, "claude")), false);
  assert.deepEqual(log.progress, []);
  assert.deepEqual(log.output, ["Cancelled. Nothing was installed."]);
});

test("runInstall fails before asking anything when no agents are found on the computer", async (t) => {
  const { results } = await setup(t, []);
  const { deps, log } = makeDeps(results);

  await assert.rejects(runInstall({}, deps), (error) => {
    assert.ok(error instanceof SelectionError);
    assert.match(error.message, /no agents were found on this computer/);

    return true;
  });

  assert.deepEqual(log.prompts, []);
});

test("runInstall says \"1 agent\", not \"1 agents\", when it installs into a single agent", async (t) => {
  const { skillDir, results } = await setup(t, ["claude"]);
  const { deps, log } = makeDeps(results);

  await runInstall({ skillDir, agents: ["claude"], yes: true }, deps);

  assert.equal(log.progress.at(-1), "succeed: Installed review-pr into 1 agent");
});

test("runInstall tells the user that Cursor also reads the Claude and ChatGPT folders", async (t) => {
  const { skillDir, results } = await setup(t, ["claude", "chatgpt", "cursor"]);
  const { deps, log } = makeDeps(results);
  const claudeDir = dirname(destination(results, "claude"));
  const chatgptDir = dirname(destination(results, "chatgpt"));

  await runInstall({ skillDir, agents: ["claude", "chatgpt"], yes: true }, deps);

  assert.deepEqual(log.output.slice(2), [
    `Cursor also reads ${claudeDir}, so it will see review-pr there too.`,
    `Cursor also reads ${chatgptDir}, so it will see review-pr there too.`,
  ]);
});

const noCursorNoteCases: { name: string; found: AgentId[]; agents: string[] }[] = [
  { name: "Cursor is not installed", found: ["claude"], agents: ["claude"] },
  { name: "Cursor is one of the chosen agents", found: ["claude", "cursor"], agents: ["claude", "cursor"] },
  { name: "only agents that Cursor does not read are chosen", found: ["cursor", "gemini"], agents: ["gemini"] },
];

for (const { name, found, agents } of noCursorNoteCases) {
  test(`runInstall does not mention Cursor when ${name}`, async (t) => {
    const { skillDir, results } = await setup(t, found);
    const { deps, log } = makeDeps(results);

    await runInstall({ skillDir, agents, yes: true }, deps);

    assert.equal(log.output.length, agents.length);
    assert.ok(log.output.every((line) => line.startsWith("✔")));
  });
}

test("runInstall marks the spinner as failed, passes the error on and prints no results when the install fails", async (t) => {
  const { skillDir, results } = await setup(t, ["claude"]);
  const { deps, log } = makeDeps(results);
  const existing = destination(results, "claude");

  await writeFiles(existing, { "marker.txt": "keep me" });

  await assert.rejects(runInstall({ skillDir, agents: ["claude"], yes: true }, deps), (error) => {
    assert.ok(error instanceof InstallError);
    assert.match(error.message, /already exists/);

    return true;
  });

  assert.deepEqual(log.progress, ["start: Installing review-pr...", "fail: Could not install review-pr"]);
  assert.deepEqual(log.output, []);
  assert.equal(await readFile(join(existing, "marker.txt"), "utf8"), "keep me");
});

const missingValueCases = [
  { missing: "skill folder", options: { agents: ["claude"], yes: true }, message: /skill folder/ },
  { missing: "agents", options: { yes: true }, message: /--agent or --all/ },
  { missing: "confirmation", options: { agents: ["claude"] }, message: /--yes/ },
];

for (const { missing, options, message } of missingValueCases) {
  test(`runInstall fails without prompting when the ${missing} is missing and there is no terminal`, async (t) => {
    const { skillDir, results } = await setup(t, ["claude"]);
    const { deps, log } = makeDeps(results, { interactive: false });
    const withSkill = missing === "skill folder" ? options : { skillDir, ...options };

    await assert.rejects(runInstall(withSkill, deps), (error) => {
      assert.ok(error instanceof UsageError);
      assert.match(error.message, message);
      assert.match(error.message, /not running in a terminal/);

      return true;
    });

    assert.deepEqual(log.prompts, []);
    assert.equal(await exists(destination(results, "claude")), false);
  });
}
