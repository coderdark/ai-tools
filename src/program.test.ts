import { test } from "node:test";
import assert from "node:assert/strict";
import type { InstallCommandOptions } from "./install-command.ts";
import type { McpInstallOptions } from "./mcp-install-command.ts";
import type { McpUninstallOptions } from "./mcp-uninstall-command.ts";
import { buildProgram, type ProgramHandlers } from "./program.ts";

interface Recorded {
  installs: InstallCommandOptions[];
  mcpInstalls: McpInstallOptions[];
  mcpUninstalls: McpUninstallOptions[];
  mcpLists: number;
  agents: number;
  uninstalls: number;
  skills: number;
  menus: number;
}

async function run(args: string[]): Promise<Recorded> {
  const recorded: Recorded = { installs: [], mcpInstalls: [], mcpUninstalls: [], mcpLists: 0, agents: 0, uninstalls: 0, skills: 0, menus: 0 };
  const handlers: ProgramHandlers = {
    install: async (options) => {
      recorded.installs.push(options);
    },
    mcpInstall: async (options) => {
      recorded.mcpInstalls.push(options);
    },
    mcpUninstall: async (options) => {
      recorded.mcpUninstalls.push(options);
    },
    mcpList: async () => {
      recorded.mcpLists += 1;
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

  assert.deepEqual(recorded, { installs: [], mcpInstalls: [], mcpUninstalls: [], mcpLists: 0, agents: 1, uninstalls: 0, skills: 0, menus: 0 });
});

test("uninstall runs only the uninstall handler", async () => {
  const recorded = await run(["uninstall"]);

  assert.deepEqual(recorded, { installs: [], mcpInstalls: [], mcpUninstalls: [], mcpLists: 0, agents: 0, uninstalls: 1, skills: 0, menus: 0 });
});

test("skills runs only the skills handler", async () => {
  const recorded = await run(["skills"]);

  assert.deepEqual(recorded, { installs: [], mcpInstalls: [], mcpUninstalls: [], mcpLists: 0, agents: 0, uninstalls: 0, skills: 1, menus: 0 });
});

test("the program is named ai-tools, to match the command in package.json", () => {
  const handlers: ProgramHandlers = {
    install: async () => {},
    mcpInstall: async () => {},
    mcpUninstall: async () => {},
    mcpList: async () => {},
    agents: async () => {},
    uninstall: async () => {},
    skills: async () => {},
    menu: async () => {},
  };

  assert.equal(buildProgram(handlers).name(), "ai-tools");
});

test("running with no command opens the menu", async () => {
  const recorded = await run([]);

  assert.deepEqual(recorded, { installs: [], mcpInstalls: [], mcpUninstalls: [], mcpLists: 0, agents: 0, uninstalls: 0, skills: 0, menus: 1 });
});

test("mcp install passes the name, the command after -- and every flag", async () => {
  const { mcpInstalls } = await run([
    "mcp", "install", "fs", "--agent", "claude", "--agent", "gemini", "--env", "A=1", "--env", "B=2", "--yes",
    "--", "npx", "-y", "pkg", "/data",
  ]);

  assert.deepEqual(mcpInstalls, [
    {
      name: "fs",
      url: undefined,
      command: ["npx", "-y", "pkg", "/data"],
      env: ["A=1", "B=2"],
      headers: [],
      agents: ["claude", "gemini"],
      all: false,
      yes: true,
    },
  ]);
});

test("mcp install passes the address and the headers of a remote server", async () => {
  const { mcpInstalls } = await run([
    "mcp", "install", "api", "--url", "https://mcp.example.com/mcp", "--header", "Authorization: Bearer x", "--all",
  ]);

  assert.deepEqual(mcpInstalls, [
    {
      name: "api",
      url: "https://mcp.example.com/mcp",
      command: [],
      env: [],
      headers: ["Authorization: Bearer x"],
      agents: [],
      all: true,
      yes: false,
    },
  ]);
});

test("mcp install with nothing else passes empty values, so the handler asks", async () => {
  const { mcpInstalls } = await run(["mcp", "install"]);

  assert.deepEqual(mcpInstalls, [
    { name: undefined, url: undefined, command: [], env: [], headers: [], agents: [], all: false, yes: false },
  ]);
});

test("mcp uninstall passes the name and every flag", async () => {
  const { mcpUninstalls } = await run(["mcp", "uninstall", "fs", "--agent", "claude", "--agent", "cursor", "--yes"]);

  assert.deepEqual(mcpUninstalls, [{ name: "fs", agents: ["claude", "cursor"], all: false, yes: true }]);
});

test("mcp uninstall with --all passes all", async () => {
  const { mcpUninstalls } = await run(["mcp", "uninstall", "fs", "--all"]);

  assert.deepEqual(mcpUninstalls, [{ name: "fs", agents: [], all: true, yes: false }]);
});

test("mcp uninstall with nothing else passes empty values, so the handler asks", async () => {
  const { mcpUninstalls } = await run(["mcp", "uninstall"]);

  assert.deepEqual(mcpUninstalls, [{ name: undefined, agents: [], all: false, yes: false }]);
});

test("mcp list runs the list handler once", async () => {
  const recorded = await run(["mcp", "list"]);

  assert.equal(recorded.mcpLists, 1);
  assert.deepEqual(recorded.mcpInstalls, []);
  assert.deepEqual(recorded.mcpUninstalls, []);
});
