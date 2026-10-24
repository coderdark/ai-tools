import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENTS, type Agent, type AgentId } from "../agents/registry.ts";
import { makeTempRoot } from "../test-support.ts";
import { installMcpServer, type McpOutcome } from "./install.ts";
import { McpCommandError, type CommandResult } from "./run-command.ts";
import type { McpServer } from "./server.ts";

const OK: CommandResult = { exitCode: 0, stdout: "", stderr: "" };
const NOT_FOUND: CommandResult = { exitCode: 1, stdout: "", stderr: "not found\n" };

const LOCAL: McpServer = {
  name: "fs",
  transport: { kind: "stdio", command: "npx", args: ["-y", "pkg"], env: { API_KEY: "s3cret-value" } },
};

const REMOTE_WITH_HEADERS: McpServer = {
  name: "api",
  transport: { kind: "http", url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer s3cret" } },
};

function agent(id: AgentId): Agent {
  const found = AGENTS.find((candidate) => candidate.id === id);

  assert.ok(found, id);

  return found;
}

interface World {
  /** True once an `mcp add` command has run. */
  added: boolean;
}

/** Answers a command, or returns undefined to let the fake agent behave like a real one. */
type Script = (command: string, args: string[], world: World) => CommandResult | Error | undefined;

/** Behaves like an agent: it knows the server `fs` only after `mcp add`, in the style of its own check command. */
function behaveLikeAgent(args: string[], world: World): CommandResult {
  const [, action] = args;

  if (action === "add") {
    world.added = true;

    return OK;
  }

  if (action === "get") {
    return world.added ? OK : NOT_FOUND;
  }

  return { exitCode: 0, stdout: world.added ? "fs  ready\n" : "", stderr: "" };
}

async function setup(
  t: TestContext,
  onPath: string[],
  script: Script = () => undefined,
  env: NodeJS.ProcessEnv = {},
) {
  const home = await makeTempRoot(t, "ai-toolbox-mcp-");
  const calls: string[] = [];
  const progress: string[] = [];
  const world: World = { added: false };
  const deps = {
    home,
    env,
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

function summary(outcomes: McpOutcome[]): string[] {
  return outcomes.map((outcome) => `${outcome.agent.id}:${outcome.status}`);
}

function detailOf(outcome: McpOutcome | undefined): string {
  assert.ok(outcome && "detail" in outcome, "the outcome has no detail");

  return outcome.detail;
}

test("installMcpServer asks the agent whether it knows the name, adds the server with the agent's own command, and asks again", async (t) => {
  const { deps, calls } = await setup(t, ["claude"]);
  const outcomes = await installMcpServer(LOCAL, [agent("claude")], deps);

  assert.deepEqual(calls, [
    "claude mcp get fs",
    "claude mcp add --scope user fs -e API_KEY=s3cret-value -- npx -y pkg",
    "claude mcp get fs",
  ]);
  assert.deepEqual(summary(outcomes), ["claude:confirmed"]);
});

test("installMcpServer reports an agent that already has a server with the name as already installed, and never runs add for it", async (t) => {
  const { home, deps, calls } = await setup(t, ["codex"], (_command, args) => (args[1] === "get" ? OK : undefined));
  const [outcome] = await installMcpServer(LOCAL, [agent("chatgpt")], deps);

  assert.deepEqual(outcome, {
    agent: agent("chatgpt"),
    status: "already-installed",
    savedIn: join(home, ".codex", "config.toml"),
  });
  assert.deepEqual(calls, ["codex mcp get fs --json"]);
});

test("installMcpServer reports an agent whose listing already names the server as already installed, but not one that names only a longer name", async (t) => {
  const listing = (output: string): Script => (_command, args) =>
    args[1] === "list" ? { exitCode: 0, stdout: output, stderr: "" } : undefined;
  const taken = await setup(t, ["gemini"], listing("fs  connected\n"));
  const similar = await setup(t, ["gemini"], (_command, args, world) =>
    args[1] === "list" ? { exitCode: 0, stdout: world.added ? "fs  ready\nmyfs  ready\n" : "myfs  ready\n", stderr: "" } : undefined,
  );

  assert.deepEqual(summary(await installMcpServer(LOCAL, [agent("gemini")], taken.deps)), ["gemini:already-installed"]);
  assert.deepEqual(summary(await installMcpServer(LOCAL, [agent("gemini")], similar.deps)), ["gemini:confirmed"]);
});

test("installMcpServer skips an agent whose check command cannot run, and says why", async (t) => {
  const { deps, calls } = await setup(t, ["claude"], () => new McpCommandError("claude did not finish in time"));
  const [outcome] = await installMcpServer(LOCAL, [agent("claude")], deps);

  assert.deepEqual(outcome, { agent: agent("claude"), status: "skipped", detail: "claude did not finish in time" });
  assert.deepEqual(calls, ["claude mcp get fs"]);
});

test("installMcpServer confirms through a listing only when the name appears in it", async (t) => {
  const found = await setup(t, ["gemini"]);
  const missing = await setup(t, ["gemini"], (_command, args, world) =>
    args[1] === "list" ? { exitCode: 0, stdout: world.added ? "other  connected\n" : "", stderr: "" } : undefined,
  );

  assert.deepEqual(summary(await installMcpServer(LOCAL, [agent("gemini")], found.deps)), ["gemini:confirmed"]);

  const [outcome] = await installMcpServer(LOCAL, [agent("gemini")], missing.deps);

  assert.equal(outcome?.status, "unconfirmed");
  assert.match(detailOf(outcome), /does not list/);
});

test("installMcpServer reports an agent that refuses the add, with its message, and does not ask it to confirm", async (t) => {
  const { deps, calls } = await setup(t, ["claude"], (_command, args) =>
    args[1] === "add" ? { exitCode: 1, stdout: "", stderr: "something went wrong\nsecond line\n" } : undefined,
  );
  const [outcome] = await installMcpServer(LOCAL, [agent("claude")], deps);

  assert.deepEqual(outcome, {
    agent: agent("claude"),
    status: "failed",
    detail: "something went wrong\nsecond line",
  });
  assert.equal(calls.length, 2);
});

test("installMcpServer reports an agent whose add command cannot run, without the arguments", async (t) => {
  const { deps } = await setup(t, ["claude"], (_command, args) =>
    args[1] === "add" ? new McpCommandError("claude did not finish in time") : undefined,
  );
  const [outcome] = await installMcpServer(LOCAL, [agent("claude")], deps);

  assert.deepEqual(outcome, { agent: agent("claude"), status: "failed", detail: "claude did not finish in time" });
});

test("installMcpServer says when the add worked but the agent could not be asked afterwards", async (t) => {
  const { deps } = await setup(t, ["claude"], (_command, args, world) =>
    args[1] === "get" && world.added ? { exitCode: 1, stdout: "", stderr: "No MCP server found with name: fs\n" } : undefined,
  );
  const [outcome] = await installMcpServer(LOCAL, [agent("claude")], deps);

  assert.equal(outcome?.status, "unconfirmed");
  assert.match(detailOf(outcome), /No MCP server found/);
});

test("installMcpServer skips an agent whose command is not on PATH, and runs nothing for it", async (t) => {
  const { deps, calls } = await setup(t, []);
  const [outcome] = await installMcpServer(LOCAL, [agent("claude")], deps);

  assert.deepEqual(outcome, { agent: agent("claude"), status: "skipped", detail: "claude was not found on PATH" });
  assert.deepEqual(calls, []);
});

test("installMcpServer skips an agent that cannot take the server, and says why, before running anything", async (t) => {
  const { deps, calls } = await setup(t, ["codex"]);
  const [outcome] = await installMcpServer(REMOTE_WITH_HEADERS, [agent("chatgpt")], deps);

  assert.equal(outcome?.status, "skipped");
  assert.match(detailOf(outcome), /custom headers/);
  assert.deepEqual(calls, []);
});

test("installMcpServer adds a server to Cursor's mcp.json and then asks Cursor's agent command", async (t) => {
  const { home, deps, calls } = await setup(t, ["agent"], (_command, args) =>
    args[1] === "list" ? { exitCode: 0, stdout: "fs: ready\n", stderr: "" } : undefined,
  );
  const outcomes = await installMcpServer(LOCAL, [agent("cursor")], deps);
  const written = JSON.parse(await readFile(join(home, ".cursor", "mcp.json"), "utf8"));

  assert.deepEqual(written, {
    mcpServers: { fs: { type: "stdio", command: "npx", args: ["-y", "pkg"], env: { API_KEY: "s3cret-value" } } },
  });
  assert.deepEqual(calls, ["agent mcp list"]);
  assert.deepEqual(summary(outcomes), ["cursor:confirmed"]);
});

test("installMcpServer shows the line Cursor prints for the server, without terminal control codes", async (t) => {
  const listing = "\u001b[2K\u001b[GLoading MCPs…\n\u001b[2K\u001b[1A\u001b[2K\u001b[Gfs: not loaded (needs approval)\n";
  const { home, deps } = await setup(t, ["agent"], (_command, args) =>
    args[1] === "list" ? { exitCode: 0, stdout: listing, stderr: "" } : undefined,
  );
  const [outcome] = await installMcpServer(LOCAL, [agent("cursor")], deps);

  assert.deepEqual(outcome, {
    agent: agent("cursor"),
    status: "confirmed",
    note: "fs: not loaded (needs approval)",
    savedIn: join(home, ".cursor", "mcp.json"),
  });
});

test("installMcpServer still adds to Cursor when Cursor's agent command is missing, and says it could not check", async (t) => {
  const { home, deps } = await setup(t, []);
  const [outcome] = await installMcpServer(LOCAL, [agent("cursor")], deps);

  assert.equal(outcome?.status, "unconfirmed");
  assert.match(detailOf(outcome), /agent was not found on PATH/);
  assert.equal(JSON.parse(await readFile(join(home, ".cursor", "mcp.json"), "utf8")).mcpServers.fs.command, "npx");
});

test("installMcpServer leaves Cursor's file alone: a taken name is already installed, and a file that is not JSON is skipped", async (t) => {
  const taken = await setup(t, ["agent"]);
  const broken = await setup(t, ["agent"]);
  const takenPath = join(taken.home, ".cursor", "mcp.json");
  const brokenPath = join(broken.home, ".cursor", "mcp.json");
  const takenText = JSON.stringify({ mcpServers: { fs: { url: "https://old.example" } } });

  await mkdir(join(taken.home, ".cursor"));
  await mkdir(join(broken.home, ".cursor"));
  await writeFile(takenPath, takenText);
  await writeFile(brokenPath, "// comment\n{}");

  const [takenOutcome] = await installMcpServer(LOCAL, [agent("cursor")], taken.deps);
  const [brokenOutcome] = await installMcpServer(LOCAL, [agent("cursor")], broken.deps);

  assert.deepEqual(takenOutcome, { agent: agent("cursor"), status: "already-installed", savedIn: takenPath });
  assert.equal(brokenOutcome?.status, "skipped");
  assert.match(detailOf(brokenOutcome), /not valid JSON/);
  assert.equal(await readFile(takenPath, "utf8"), takenText);
  assert.equal(await readFile(brokenPath, "utf8"), "// comment\n{}");
});

test("installMcpServer checks every agent before it changes any, and a skipped or failed agent does not stop the others", async (t) => {
  const { deps, progress } = await setup(t, ["codex", "grok"], (command, args) =>
    command === "codex" && args[1] === "add" ? { exitCode: 1, stdout: "", stderr: "boom\n" } : undefined,
  );

  const outcomes = await installMcpServer(LOCAL, [agent("claude"), agent("chatgpt"), agent("grok")], deps);

  assert.deepEqual(summary(outcomes), ["claude:skipped", "chatgpt:failed", "grok:confirmed"]);
  assert.deepEqual(progress, ["chatgpt", "grok"]);
});

test("installMcpServer keeps secrets out of what it reports", async (t) => {
  const { deps } = await setup(t, ["claude"], (_command, args) =>
    args[1] === "add" ? { exitCode: 1, stdout: "", stderr: "bad value s3cret-value for API_KEY\n" } : undefined,
  );
  const [outcome] = await installMcpServer(LOCAL, [agent("claude")], deps);

  assert.equal(detailOf(outcome), "bad value *** for API_KEY");
});

test("installMcpServer does not blank out short values such as 1 in what it reports", async (t) => {
  const server: McpServer = {
    name: "fs",
    transport: { kind: "stdio", command: "npx", args: [], env: { DEBUG: "1", API_KEY: "s3cret-value" } },
  };
  const { deps } = await setup(t, ["claude"], (_command, args) =>
    args[1] === "add" ? { exitCode: 1, stdout: "", stderr: "port 1 refused s3cret-value\n" } : undefined,
  );
  const [outcome] = await installMcpServer(server, [agent("claude")], deps);

  assert.equal(detailOf(outcome), "port 1 refused ***");
});

test("installMcpServer shows only the first lines of a long message", async (t) => {
  const long = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join("\n");
  const { deps } = await setup(t, ["claude"], (_command, args) =>
    args[1] === "add" ? { exitCode: 1, stdout: "", stderr: long } : undefined,
  );
  const [outcome] = await installMcpServer(LOCAL, [agent("claude")], deps);

  assert.equal(detailOf(outcome), "line 1\nline 2\nline 3");
});

test("installMcpServer says where each agent saved the server, for the agents whose file was confirmed by a real run", async (t) => {
  const { home, deps } = await setup(t, ["claude", "codex"]);
  const outcomes = await installMcpServer(LOCAL, [agent("cursor"), agent("claude"), agent("chatgpt")], deps);

  assert.deepEqual(
    outcomes.map(({ savedIn }) => savedIn),
    [join(home, ".cursor", "mcp.json"), join(home, ".claude.json"), join(home, ".codex", "config.toml")],
  );
});

test("installMcpServer follows CLAUDE_CONFIG_DIR and CODEX_HOME when it says where the server was saved", async (t) => {
  const env = { CLAUDE_CONFIG_DIR: "/elsewhere/claude", CODEX_HOME: "/elsewhere/codex" };
  const { deps } = await setup(t, ["claude", "codex"], () => undefined, env);
  const outcomes = await installMcpServer(LOCAL, [agent("claude"), agent("chatgpt")], deps);

  assert.deepEqual(
    outcomes.map(({ savedIn }) => savedIn),
    [join("/elsewhere/claude", ".claude.json"), join("/elsewhere/codex", "config.toml")],
  );
});

test("installMcpServer gives no path for an agent whose file has not been confirmed, nor for an agent that failed", async (t) => {
  const { deps } = await setup(t, ["gemini", "claude"], (command, args) =>
    command === "claude" ? (args[1] === "add" ? { exitCode: 1, stdout: "", stderr: "no\n" } : NOT_FOUND) : undefined,
  );
  const outcomes = await installMcpServer(LOCAL, [agent("gemini"), agent("claude")], deps);

  assert.deepEqual(summary(outcomes), ["gemini:confirmed", "claude:failed"]);
  assert.deepEqual(outcomes.map(({ savedIn }) => savedIn), [undefined, undefined]);
});

test("installMcpServer tells the user that Claude's list is Claude Code's, and not the chat app's connectors", async (t) => {
  const { deps } = await setup(t, ["claude"]);
  const [outcome] = await installMcpServer(LOCAL, [agent("claude")], deps);

  assert.match(outcome?.scopeNote ?? "", /Claude Code/);
  assert.match(outcome?.scopeNote ?? "", /Connectors/);
});

function claudeGet(output: string): Script {
  return (_command, args) => (args[1] === "get" ? { exitCode: 0, stdout: output, stderr: "" } : undefined);
}

test("installMcpServer says where Claude's existing server lives when Claude says it is in the user config", async (t) => {
  const output = "fs:\n  Scope: User config (available in all your projects)\n  Status: Connected\n";
  const { home, deps } = await setup(t, ["claude"], claudeGet(output));
  const [outcome] = await installMcpServer(LOCAL, [agent("claude")], deps);

  assert.equal(outcome?.status, "already-installed");
  assert.equal(outcome?.savedIn, join(home, ".claude.json"));
  assert.match(outcome?.scopeNote ?? "", /Connectors/);
});

test("installMcpServer passes on Claude's own words, and no path, when the existing server is not in the user config", async (t) => {
  const output = "fs:\n  Scope: Local config (private to you in this project)\n";
  const { deps } = await setup(t, ["claude"], claudeGet(output));
  const [outcome] = await installMcpServer(LOCAL, [agent("claude")], deps);

  assert.equal(outcome?.status, "already-installed");
  assert.equal(outcome?.savedIn, undefined);
  assert.equal(outcome && "note" in outcome ? outcome.note : undefined, "Local config (private to you in this project)");
});

test("installMcpServer gives no path for an existing Claude server when Claude does not say where it is", async (t) => {
  const { deps } = await setup(t, ["claude"], claudeGet("fs:\n  Status: Connected\n"));
  const [outcome] = await installMcpServer(LOCAL, [agent("claude")], deps);

  assert.equal(outcome?.status, "already-installed");
  assert.equal(outcome?.savedIn, undefined);
});
