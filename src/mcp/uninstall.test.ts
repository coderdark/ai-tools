import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENTS, type Agent, type AgentId } from "../agents/registry.ts";
import { makeTempRoot } from "../test-support.ts";
import { McpCommandError, type CommandResult } from "./run-command.ts";
import { findMcpServer, uninstallMcpServer, type McpFound, type McpRemovalOutcome } from "./uninstall.ts";

const OK: CommandResult = { exitCode: 0, stdout: "", stderr: "" };
const NOT_FOUND: CommandResult = { exitCode: 1, stdout: "", stderr: "not found\n" };

function agent(id: AgentId): Agent {
  const found = AGENTS.find((candidate) => candidate.id === id);

  assert.ok(found, id);

  return found;
}

interface World {
  /** True once a `mcp remove` command has run. */
  removed: boolean;
}

/** Answers a command, or returns undefined to let the fake agent behave like a real one. */
type Script = (command: string, args: string[], world: World) => CommandResult | Error | undefined;

/** Knows the server `fs` until `mcp remove` has run, in the style of its own check command. */
function behaveLikeAgent(args: string[], world: World): CommandResult {
  const [, action] = args;

  if (action === "remove") {
    world.removed = true;

    return OK;
  }

  if (action === "get") {
    return world.removed ? NOT_FOUND : OK;
  }

  return { exitCode: 0, stdout: world.removed ? "" : "fs  ready\n", stderr: "" };
}

async function setup(t: TestContext, onPath: string[], script: Script = () => undefined) {
  const home = await makeTempRoot(t, "ai-toolbox-mcp-rm-");
  const calls: string[] = [];
  const progress: string[] = [];
  const world: World = { removed: false };
  const deps = {
    home,
    env: {},
    isOnPath: (name: string) => onPath.includes(name),
    runCommand: async (command: string, args: string[]): Promise<CommandResult> => {
      calls.push([command, ...args].join(" "));

      const result = script(command, args, world) ?? behaveLikeAgent(args, world);

      if (result instanceof Error) {
        throw result;
      }

      return result;
    },
    onProgress: (current: Agent) => progress.push(current.id),
  };

  return { home, calls, progress, deps };
}

function summary(outcomes: McpRemovalOutcome[]): string[] {
  return outcomes.map((outcome) => `${outcome.agent.id}:${outcome.status}`);
}

function states(found: McpFound[]): string[] {
  return found.map(({ agent: { id }, presence }) => `${id}:${presence.state}`);
}

async function findAndRemove(
  deps: Awaited<ReturnType<typeof setup>>["deps"],
  ids: AgentId[],
): Promise<McpRemovalOutcome[]> {
  return uninstallMcpServer("fs", await findMcpServer("fs", ids.map(agent), deps), deps);
}

test("findMcpServer says what each agent has, and says unknown for an agent whose command is missing", async (t) => {
  const { deps, calls } = await setup(t, ["codex"], (command) => (command === "codex" ? OK : undefined));
  const found = await findMcpServer("fs", [agent("chatgpt"), agent("claude")], deps);

  assert.deepEqual(states(found), ["chatgpt:present", "claude:unknown"]);
  assert.deepEqual(found[1]?.presence, { state: "unknown", reason: "claude was not found on PATH" });
  assert.deepEqual(calls, ["codex mcp get fs --json"]);
});

test("uninstallMcpServer runs the agent's own remove command, asks again, and says where it was removed from", async (t) => {
  const { home, deps, calls } = await setup(t, ["codex"]);
  const outcomes = await findAndRemove(deps, ["chatgpt"]);

  assert.deepEqual(outcomes, [
    { agent: agent("chatgpt"), status: "removed", savedIn: join(home, ".codex", "config.toml") },
  ]);
  assert.deepEqual(calls, ["codex mcp get fs --json", "codex mcp remove fs", "codex mcp get fs --json"]);
});

test("uninstallMcpServer reports not installed, without running remove, for an agent that does not have the server", async (t) => {
  const { deps, calls } = await setup(t, ["codex"], (_command, args) => (args[1] === "get" ? NOT_FOUND : undefined));
  const outcomes = await findAndRemove(deps, ["chatgpt"]);

  assert.deepEqual(outcomes, [{ agent: agent("chatgpt"), status: "not-installed" }]);
  assert.deepEqual(calls, ["codex mcp get fs --json"]);
});

test("uninstallMcpServer skips an agent whose question could not be answered, and says why", async (t) => {
  const { deps, calls } = await setup(t, ["codex"], () => new McpCommandError("codex did not finish in time"));
  const outcomes = await findAndRemove(deps, ["chatgpt"]);

  assert.deepEqual(outcomes, [
    { agent: agent("chatgpt"), status: "skipped", detail: "codex did not finish in time" },
  ]);
  assert.deepEqual(calls, ["codex mcp get fs --json"]);
});

test("uninstallMcpServer leaves a Claude server alone when Claude says it is not in the user config", async (t) => {
  const output = "fs:\n  Scope: Local config (private to you in this project)\n";
  const { deps, calls } = await setup(t, ["claude"], (_command, args) =>
    args[1] === "get" ? { exitCode: 0, stdout: output, stderr: "" } : undefined,
  );
  const [outcome] = await findAndRemove(deps, ["claude"]);

  assert.equal(outcome?.status, "skipped");
  assert.match(outcome && "detail" in outcome ? outcome.detail : "", /Local config \(private to you in this project\)/);
  assert.match(outcome && "detail" in outcome ? outcome.detail : "", /Only the user-level server is removed/);
  assert.deepEqual(calls, ["claude mcp get fs"]);
});

test("uninstallMcpServer removes a Claude server at user scope when Claude says it is in the user config", async (t) => {
  const output = "fs:\n  Scope: User config (available in all your projects)\n";
  const { home, deps, calls } = await setup(t, ["claude"], (_command, args, world) =>
    args[1] === "get" ? (world.removed ? NOT_FOUND : { exitCode: 0, stdout: output, stderr: "" }) : undefined,
  );
  const outcomes = await findAndRemove(deps, ["claude"]);

  assert.deepEqual(outcomes, [{ agent: agent("claude"), status: "removed", savedIn: join(home, ".claude.json") }]);
  assert.deepEqual(calls, ["claude mcp get fs", "claude mcp remove --scope user fs", "claude mcp get fs"]);
});

test("uninstallMcpServer reports a remove command that fails, with what the agent printed", async (t) => {
  const { deps } = await setup(t, ["codex"], (_command, args) =>
    args[1] === "remove" ? { exitCode: 2, stdout: "", stderr: "cannot write the config\n" } : undefined,
  );
  const [outcome] = await findAndRemove(deps, ["chatgpt"]);

  assert.deepEqual(outcome, { agent: agent("chatgpt"), status: "failed", detail: "cannot write the config" });
});

test("uninstallMcpServer reports a remove command that cannot run", async (t) => {
  const { deps } = await setup(t, ["codex"], (_command, args) =>
    args[1] === "remove" ? new McpCommandError("codex could not be run") : undefined,
  );
  const [outcome] = await findAndRemove(deps, ["chatgpt"]);

  assert.deepEqual(outcome, { agent: agent("chatgpt"), status: "failed", detail: "codex could not be run" });
});

test("uninstallMcpServer fails an agent that still has the server after its remove command ran", async (t) => {
  const { deps } = await setup(t, ["codex"], (_command, args) => (args[1] === "get" ? OK : undefined));
  const [outcome] = await findAndRemove(deps, ["chatgpt"]);

  assert.deepEqual(outcome, {
    agent: agent("chatgpt"),
    status: "failed",
    detail: "ChatGPT still has a server named fs after the remove command ran",
  });
});

test("uninstallMcpServer removes Cursor's entry from its file and keeps the rest", async (t) => {
  const { home, deps, calls } = await setup(t, []);
  const path = join(home, ".cursor", "mcp.json");

  await mkdir(join(home, ".cursor"));
  await writeFile(path, JSON.stringify({ mcpServers: { fs: { command: "npx" }, other: { url: "https://x.test" } } }));

  const outcomes = await findAndRemove(deps, ["cursor"]);

  assert.deepEqual(outcomes, [{ agent: agent("cursor"), status: "removed", savedIn: path }]);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { mcpServers: { other: { url: "https://x.test" } } });
  assert.deepEqual(calls, []);
});

test("uninstallMcpServer skips Cursor, and leaves its file alone, when the file is not JSON", async (t) => {
  const { home, deps } = await setup(t, []);
  const path = join(home, ".cursor", "mcp.json");

  await mkdir(join(home, ".cursor"));
  await writeFile(path, "// comment\n{}");

  const [outcome] = await findAndRemove(deps, ["cursor"]);

  assert.equal(outcome?.status, "skipped");
  assert.equal(await readFile(path, "utf8"), "// comment\n{}");
});

test("uninstallMcpServer reports progress for each agent it removes from, and one failure does not stop the others", async (t) => {
  const { home, deps, progress } = await setup(t, ["codex"], (_command, args) =>
    args[1] === "remove" ? { exitCode: 1, stdout: "", stderr: "no\n" } : undefined,
  );

  await mkdir(join(home, ".cursor"));
  await writeFile(join(home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { fs: {} } }));

  const outcomes = await findAndRemove(deps, ["chatgpt", "cursor"]);

  assert.deepEqual(summary(outcomes), ["chatgpt:failed", "cursor:removed"]);
  assert.deepEqual(progress, ["chatgpt", "cursor"]);
});
