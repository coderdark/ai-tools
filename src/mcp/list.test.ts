import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENTS, type Agent, type AgentId } from "../agents/registry.ts";
import { makeTempRoot } from "../test-support.ts";
import { listMcpServers, type AgentMcpListing } from "./list.ts";
import { McpCommandError, type CommandResult } from "./run-command.ts";

const SECRET = "s3cret-value";

function agent(id: AgentId): Agent {
  const found = AGENTS.find((candidate) => candidate.id === id);

  assert.ok(found, id);

  return found;
}

type Answer = CommandResult | Error;

async function setup(t: TestContext, options: { onPath?: string[]; answer?: Answer; env?: NodeJS.ProcessEnv } = {}) {
  const { onPath = [], answer = { exitCode: 0, stdout: "[]", stderr: "" }, env = {} } = options;
  const home = await makeTempRoot(t, "ai-toolbox-list-");
  const calls: string[] = [];
  const deps = {
    home,
    env,
    isOnPath: (name: string) => onPath.includes(name),
    runCommand: async (command: string, args: string[]): Promise<CommandResult> => {
      calls.push([command, ...args].join(" "));

      if (answer instanceof Error) {
        throw answer;
      }

      return answer;
    },
  };

  return { home, calls, deps };
}

async function listOne(t: TestContext, id: AgentId, options: Parameters<typeof setup>[1] = {}) {
  const world = await setup(t, options);
  const [listing] = await listMcpServers([agent(id)], world.deps);

  assert.ok(listing);

  return { ...world, listing };
}

function notListedReason(listing: AgentMcpListing): string {
  assert.equal(listing.status, "not-listed");

  return listing.status === "not-listed" ? listing.reason : "";
}

test("listMcpServers reads Cursor's file: names sorted, a kind for each, never the command, address or secrets", async (t) => {
  const world = await setup(t);
  const path = join(world.home, ".cursor", "mcp.json");

  await mkdir(join(world.home, ".cursor"));
  await writeFile(
    path,
    JSON.stringify({
      mcpServers: {
        zeta: { url: "https://x.test/mcp?key=" + SECRET, headers: { Authorization: SECRET } },
        alpha: { type: "stdio", command: "npx", args: ["-y", "pkg"], env: { TOKEN: SECRET } },
        odd: { something: "else" },
      },
    }),
  );

  const [listing] = await listMcpServers([agent("cursor")], world.deps);

  assert.deepEqual(listing, {
    agent: agent("cursor"),
    status: "listed",
    savedIn: path,
    servers: [
      { name: "alpha", kind: "local command" },
      { name: "odd", kind: "other" },
      { name: "zeta", kind: "remote address" },
    ],
  });
  assert.ok(!JSON.stringify(listing).includes(SECRET));
  assert.deepEqual(world.calls, []);
});

test("listMcpServers says there are none when Cursor's file is missing, and creates nothing", async (t) => {
  const { home, listing } = await listOne(t, "cursor");

  assert.deepEqual(listing, {
    agent: agent("cursor"),
    status: "listed",
    savedIn: join(home, ".cursor", "mcp.json"),
    servers: [],
  });
  await assert.rejects(readFile(join(home, ".cursor", "mcp.json")));
});

test("listMcpServers says why a file could not be read, and leaves it unchanged", async (t) => {
  const world = await setup(t);
  const path = join(world.home, ".cursor", "mcp.json");

  await mkdir(join(world.home, ".cursor"));
  await writeFile(path, "// comment\n{}");

  const [listing] = await listMcpServers([agent("cursor")], world.deps);

  assert.match(notListedReason(listing as AgentMcpListing), /is not valid JSON/);
  assert.equal(await readFile(path, "utf8"), "// comment\n{}");
});

test("listMcpServers lists only Claude's user-level servers, from its file, without running claude", async (t) => {
  const world = await setup(t, { onPath: ["claude"] });
  const path = join(world.home, ".claude.json");

  await writeFile(
    path,
    JSON.stringify({
      userID: "someone",
      mcpServers: { remote: { type: "http", url: "https://x.test/mcp" } },
      projects: { "/some/project": { mcpServers: { local: { type: "stdio", command: "node" } } } },
    }),
  );

  const [listing] = await listMcpServers([agent("claude")], world.deps);

  assert.deepEqual(listing, {
    agent: agent("claude"),
    status: "listed",
    savedIn: path,
    note: "User-level servers only. Servers set up for one project are not listed.",
    servers: [{ name: "remote", kind: "remote address" }],
  });
  assert.deepEqual(world.calls, []);
});

test("listMcpServers reads Claude's file from CLAUDE_CONFIG_DIR when it is set", async (t) => {
  const config = await makeTempRoot(t, "ai-toolbox-claude-config-");

  await writeFile(join(config, ".claude.json"), JSON.stringify({ mcpServers: { here: { command: "node" } } }));

  const { listing } = await listOne(t, "claude", { env: { CLAUDE_CONFIG_DIR: config } });

  assert.equal(listing.status === "listed" && listing.savedIn, join(config, ".claude.json"));
  assert.deepEqual(listing.status === "listed" && listing.servers, [{ name: "here", kind: "local command" }]);
});

test("listMcpServers asks codex for its json listing, and says where codex keeps its servers", async (t) => {
  const output = JSON.stringify([
    { name: "b", transport: { type: "streamable_http", url: "https://x.test/mcp?key=" + SECRET } },
    { name: "a", transport: { type: "stdio", command: "npx", env: { TOKEN: SECRET } } },
  ]);
  const { home, calls, listing } = await listOne(t, "chatgpt", {
    onPath: ["codex"],
    answer: { exitCode: 0, stdout: output, stderr: "" },
  });

  assert.deepEqual(listing, {
    agent: agent("chatgpt"),
    status: "listed",
    savedIn: join(home, ".codex", "config.toml"),
    servers: [
      { name: "a", kind: "local command" },
      { name: "b", kind: "remote address" },
    ],
  });
  assert.ok(!JSON.stringify(listing).includes(SECRET));
  assert.deepEqual(calls, ["codex mcp list --json"]);
});

test("listMcpServers says why codex could not be listed", async (t) => {
  const missing = await listOne(t, "chatgpt");
  const failed = await listOne(t, "chatgpt", {
    onPath: ["codex"],
    answer: { exitCode: 2, stdout: "", stderr: "cannot read the config\n" },
  });
  const timedOut = await listOne(t, "chatgpt", { onPath: ["codex"], answer: new McpCommandError("codex did not finish in time") });
  const garbled = await listOne(t, "chatgpt", { onPath: ["codex"], answer: { exitCode: 0, stdout: "oops", stderr: "" } });

  assert.equal(notListedReason(missing.listing), "codex was not found on PATH");
  assert.equal(notListedReason(failed.listing), "cannot read the config");
  assert.equal(notListedReason(timedOut.listing), "codex did not finish in time");
  assert.equal(notListedReason(garbled.listing), "could not read what codex printed");
  assert.deepEqual(missing.calls, []);
});

test("listMcpServers does not guess for Gemini and Grok, and says so", async (t) => {
  const world = await setup(t, { onPath: ["gemini", "grok"] });
  const listings = await listMcpServers([agent("gemini"), agent("grok")], world.deps);

  assert.deepEqual(
    listings.map(notListedReason),
    [
      "how to list its servers has not been confirmed on a real machine",
      "how to list its servers has not been confirmed on a real machine",
    ],
  );
  assert.deepEqual(world.calls, []);
});

test("listMcpServers removes terminal control codes from server names", async (t) => {
  const world = await setup(t);

  await mkdir(join(world.home, ".cursor"));
  await writeFile(
    join(world.home, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { "evil\u001b[2Jname\n": { command: "node" } } }),
  );

  const [listing] = await listMcpServers([agent("cursor")], world.deps);

  assert.deepEqual(listing?.status === "listed" && listing.servers, [{ name: "evilname?", kind: "local command" }]);
});

test("listMcpServers lists every agent it is given, in order, and one problem does not stop the others", async (t) => {
  const world = await setup(t, { onPath: ["codex"] });
  const listings = await listMcpServers([agent("gemini"), agent("chatgpt"), agent("cursor")], world.deps);

  assert.deepEqual(
    listings.map((listing) => `${listing.agent.id}:${listing.status}`),
    ["gemini:not-listed", "chatgpt:listed", "cursor:listed"],
  );
});
