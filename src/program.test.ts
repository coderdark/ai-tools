import { test } from "node:test";
import assert from "node:assert/strict";
import type { InstallCommandOptions } from "./install-command.ts";
import { buildProgram, type ProgramHandlers } from "./program.ts";

interface Recorded {
  installs: InstallCommandOptions[];
  agents: number;
  uninstalls: number;
  skills: number;
  menus: number;
}

async function run(args: string[]): Promise<Recorded> {
  const recorded: Recorded = { installs: [], agents: 0, uninstalls: 0, skills: 0, menus: 0 };
  const handlers: ProgramHandlers = {
    install: async (options) => {
      recorded.installs.push(options);
    },
    agents: async () => {
      recorded.agents += 1;
    },
    uninstall: async () => {
      recorded.uninstalls += 1;
    },
    skills: async () => {
      recorded.skills += 1;
    },
    menu: async () => {
      recorded.menus += 1;
    },
  };

  await buildProgram(handlers).exitOverride().parseAsync(args, { from: "user" });

  return recorded;
}

test("install passes the skill folder and every flag to the install handler", async () => {
  const { installs } = await run([
    "install",
    "./my-skill",
    "--agent",
    "claude",
    "--agent",
    "chatgpt",
    "--force",
    "--yes",
  ]);

  assert.deepEqual(installs, [
    { skillDir: "./my-skill", agents: ["claude", "chatgpt"], all: false, force: true, yes: true },
  ]);
});

test("install uses empty defaults for the flags that were not given", async () => {
  const { installs } = await run(["install", "--all"]);

  assert.deepEqual(installs, [
    { skillDir: undefined, agents: [], all: true, force: false, yes: false },
  ]);
});

test("agents runs only the agents handler", async () => {
  const recorded = await run(["agents"]);

  assert.deepEqual(recorded, { installs: [], agents: 1, uninstalls: 0, skills: 0, menus: 0 });
});

test("uninstall runs only the uninstall handler", async () => {
  const recorded = await run(["uninstall"]);

  assert.deepEqual(recorded, { installs: [], agents: 0, uninstalls: 1, skills: 0, menus: 0 });
});

test("skills runs only the skills handler", async () => {
  const recorded = await run(["skills"]);

  assert.deepEqual(recorded, { installs: [], agents: 0, uninstalls: 0, skills: 1, menus: 0 });
});

test("the program is named ai-tools, to match the command in package.json", () => {
  const handlers: ProgramHandlers = {
    install: async () => {},
    agents: async () => {},
    uninstall: async () => {},
    skills: async () => {},
    menu: async () => {},
  };

  assert.equal(buildProgram(handlers).name(), "ai-tools");
});

test("running with no command opens the menu", async () => {
  const recorded = await run([]);

  assert.deepEqual(recorded, { installs: [], agents: 0, uninstalls: 0, skills: 0, menus: 1 });
});
