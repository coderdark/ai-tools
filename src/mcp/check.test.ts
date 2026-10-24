import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentId } from "../agents/registry.ts";
import { makeTempRoot } from "../test-support.ts";
import { commandProblem, findPresence, type McpCheckDeps } from "./check.ts";
import { McpCommandError, type CommandResult } from "./run-command.ts";
import { MCP_SETUPS } from "./setups.ts";

const OK: CommandResult = { exitCode: 0, stdout: "", stderr: "" };
const NOT_FOUND: CommandResult = { exitCode: 1, stdout: "", stderr: "not found\n" };

type Answer = CommandResult | Error;

async function setup(t: TestContext, answer: Answer = OK, onPath: string[] = []) {
  const home = await makeTempRoot(t, "ai-toolbox-check-");
  const calls: string[] = [];
  const deps: McpCheckDeps = {
    home,
    env: {},
    isOnPath: (name) => onPath.includes(name),
    runCommand: async (command, args) => {
      calls.push([command, ...args].join(" "));

      if (answer instanceof Error) {
        throw answer;
      }

      return answer;
    },
  };

  return { home, calls, deps };
}

function setupOf(id: AgentId) {
  return MCP_SETUPS[id];
}

test("findPresence asks the agent's own check command, and says present, with where, when it exits 0", async (t) => {
  const { home, calls, deps } = await setup(t);

  assert.deepEqual(await findPresence("fs", setupOf("chatgpt"), deps), {
    state: "present",
    place: { savedIn: join(home, ".codex", "config.toml") },
  });
  assert.deepEqual(calls, ["codex mcp get fs --json"]);
});

test("findPresence says absent when the check command exits with an error code", async (t) => {
  const { deps } = await setup(t, NOT_FOUND);

  assert.deepEqual(await findPresence("fs", setupOf("chatgpt"), deps), { state: "absent" });
});

test("findPresence says unknown, with the reason, when the check command cannot run", async (t) => {
  const { deps } = await setup(t, new McpCommandError("codex did not finish in time"));

  assert.deepEqual(await findPresence("fs", setupOf("chatgpt"), deps), {
    state: "unknown",
    reason: "codex did not finish in time",
  });
});

test("findPresence hides the given secrets in the reason", async (t) => {
  const { deps } = await setup(t, new McpCommandError("failed with s3cret-value in it"));
  const result = await findPresence("fs", setupOf("chatgpt"), deps, ["s3cret-value"]);

  assert.deepEqual(result, { state: "unknown", reason: "failed with *** in it" });
});

test("findPresence matches a listing on the whole name, not on a longer name", async (t) => {
  const taken = await setup(t, { exitCode: 0, stdout: "fs  connected\n", stderr: "" });
  const similar = await setup(t, { exitCode: 0, stdout: "myfs  connected\n", stderr: "" });

  assert.equal((await findPresence("fs", setupOf("gemini"), taken.deps)).state, "present");
  assert.equal((await findPresence("fs", setupOf("gemini"), similar.deps)).state, "absent");
});

test("findPresence reads where Claude says the server lives", async (t) => {
  const user = await setup(t, { exitCode: 0, stdout: "fs:\n  Scope: User config (all projects)\n", stderr: "" });
  const local = await setup(t, { exitCode: 0, stdout: "fs:\n  Scope: Local config (this project)\n", stderr: "" });

  assert.deepEqual(await findPresence("fs", setupOf("claude"), user.deps), {
    state: "present",
    place: { savedIn: join(user.home, ".claude.json") },
  });
  assert.deepEqual(await findPresence("fs", setupOf("claude"), local.deps), {
    state: "present",
    place: { note: "Local config (this project)" },
  });
});

test("findPresence reads Cursor's file instead of asking a command", async (t) => {
  const { home, calls, deps } = await setup(t);
  const path = join(home, ".cursor", "mcp.json");

  assert.deepEqual(await findPresence("fs", setupOf("cursor"), deps), { state: "absent" });

  await mkdir(join(home, ".cursor"));
  await writeFile(path, JSON.stringify({ mcpServers: { fs: {} } }));

  assert.deepEqual(await findPresence("fs", setupOf("cursor"), deps), { state: "present", place: { savedIn: path } });

  await writeFile(path, "not json");

  const broken = await findPresence("fs", setupOf("cursor"), deps);

  assert.equal(broken.state, "unknown");
  assert.deepEqual(calls, []);
});

test("commandProblem names a command that is not on PATH, and nothing for Cursor's file", async (t) => {
  const { deps } = await setup(t, OK, ["codex"]);

  assert.equal(commandProblem(setupOf("claude"), deps), "claude was not found on PATH");
  assert.equal(commandProblem(setupOf("chatgpt"), deps), undefined);
  assert.equal(commandProblem(setupOf("cursor"), deps), undefined);
});
