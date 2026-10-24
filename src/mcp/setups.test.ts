import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENTS } from "../agents/registry.ts";
import type { McpServer } from "./server.ts";
import { MCP_SETUPS, type McpCliSetup, type McpJsonFileSetup } from "./setups.ts";

const LOCAL: McpServer = {
  name: "fs",
  transport: {
    kind: "stdio",
    command: "npx",
    args: ["-y", "pkg", "/data"],
    env: { API_KEY: "k", DEBUG: "1" },
  },
};

const LOCAL_NO_ENV: McpServer = {
  name: "fs",
  transport: { kind: "stdio", command: "npx", args: ["-y", "pkg", "/data"], env: {} },
};

const LOCAL_BARE: McpServer = {
  name: "fs",
  transport: { kind: "stdio", command: "node", args: [], env: {} },
};

const REMOTE: McpServer = {
  name: "api",
  transport: {
    kind: "http",
    url: "https://mcp.example.com/mcp",
    headers: { Authorization: "Bearer t", "X-Id": "7" },
  },
};

const REMOTE_BARE: McpServer = {
  name: "api",
  transport: { kind: "http", url: "https://mcp.example.com/mcp", headers: {} },
};

function cli(id: keyof typeof MCP_SETUPS): McpCliSetup {
  const setup = MCP_SETUPS[id];

  assert.equal(setup.kind, "cli");

  return setup as McpCliSetup;
}

test("every agent in the registry has an MCP setup that names its source and how it was verified", () => {
  for (const { id } of AGENTS) {
    const setup = MCP_SETUPS[id];

    assert.ok(setup, id);
    assert.match(setup.source, /^https:\/\//, id);
    assert.ok(setup.verified.length > 0, id);
  }
});

test("Claude adds a local server at user scope, with options after the name and the command after --", () => {
  assert.deepEqual(cli("claude").add(LOCAL), [
    "mcp", "add", "--scope", "user", "fs", "-e", "API_KEY=k", "-e", "DEBUG=1", "--", "npx", "-y", "pkg", "/data",
  ]);
  assert.deepEqual(cli("claude").add(LOCAL_BARE), ["mcp", "add", "--scope", "user", "fs", "--", "node"]);
});

test("Claude adds a remote server over http with its headers after the address", () => {
  assert.deepEqual(cli("claude").add(REMOTE), [
    "mcp", "add", "--scope", "user", "--transport", "http", "api", "https://mcp.example.com/mcp",
    "--header", "Authorization: Bearer t", "--header", "X-Id: 7",
  ]);
  assert.deepEqual(cli("claude").add(REMOTE_BARE), [
    "mcp", "add", "--scope", "user", "--transport", "http", "api", "https://mcp.example.com/mcp",
  ]);
});

test("Codex adds a local server with --env flags and the command after --", () => {
  assert.deepEqual(cli("chatgpt").add(LOCAL), [
    "mcp", "add", "fs", "--env", "API_KEY=k", "--env", "DEBUG=1", "--", "npx", "-y", "pkg", "/data",
  ]);
});

test("Codex adds a remote server with --url", () => {
  assert.deepEqual(cli("chatgpt").add(REMOTE_BARE), [
    "mcp", "add", "api", "--url", "https://mcp.example.com/mcp",
  ]);
});

test("Codex cannot take custom headers on the command line and says so", () => {
  assert.match(String(cli("chatgpt").unsupported?.(REMOTE)), /headers/);
  assert.equal(cli("chatgpt").unsupported?.(REMOTE_BARE), undefined);
  assert.equal(cli("chatgpt").unsupported?.(LOCAL), undefined);
});

test("Gemini adds a local server at user scope with the arguments after the command", () => {
  assert.deepEqual(cli("gemini").add(LOCAL_BARE), ["mcp", "add", "--scope", "user", "fs", "node"]);
  assert.deepEqual(cli("gemini").add(LOCAL_NO_ENV), [
    "mcp", "add", "--scope", "user", "fs", "npx", "--", "-y", "pkg", "/data",
  ]);
});

test("Gemini puts -e flags before the name and puts -- before the first argument that starts with a dash", () => {
  assert.deepEqual(cli("gemini").add(LOCAL), [
    "mcp", "add", "--scope", "user", "-e", "API_KEY=k", "-e", "DEBUG=1", "fs", "npx", "--", "-y", "pkg", "/data",
  ]);
  assert.deepEqual(
    cli("gemini").add({
      name: "fs",
      transport: { kind: "stdio", command: "python", args: ["server.py", "--port", "1"], env: {} },
    }),
    ["mcp", "add", "--scope", "user", "fs", "python", "server.py", "--", "--port", "1"],
  );
});

test("Gemini adds a remote server over http with its headers before the name", () => {
  assert.deepEqual(cli("gemini").add(REMOTE), [
    "mcp", "add", "--scope", "user", "--transport", "http",
    "--header", "Authorization: Bearer t", "--header", "X-Id: 7", "api", "https://mcp.example.com/mcp",
  ]);
});

test("Grok adds a local server at user scope with the command after --", () => {
  assert.deepEqual(cli("grok").add(LOCAL), [
    "mcp", "add", "--scope", "user", "fs", "-e", "API_KEY=k", "-e", "DEBUG=1", "--", "npx", "-y", "pkg", "/data",
  ]);
});

test("Grok adds a remote server over http with its headers after the address", () => {
  assert.deepEqual(cli("grok").add(REMOTE), [
    "mcp", "add", "--scope", "user", "--transport", "http", "api", "https://mcp.example.com/mcp",
    "--header", "Authorization: Bearer t", "--header", "X-Id: 7",
  ]);
});

test("each command line agent runs its own binary, taken from the registry", () => {
  for (const id of ["claude", "chatgpt", "gemini", "grok"] as const) {
    const agent = AGENTS.find((candidate) => candidate.id === id);

    assert.equal(cli(id).command, agent?.binaries[0], id);
  }
});

test("each agent confirms an install with its own listing command", () => {
  assert.deepEqual(MCP_SETUPS.claude.check.args("fs"), ["mcp", "get", "fs"]);
  assert.deepEqual(MCP_SETUPS.chatgpt.check.args("fs"), ["mcp", "get", "fs", "--json"]);
  assert.deepEqual(MCP_SETUPS.cursor.check.args("fs"), ["mcp", "list"]);
  assert.deepEqual(MCP_SETUPS.gemini.check.args("fs"), ["mcp", "list"]);
  assert.deepEqual(MCP_SETUPS.grok.check.args("fs"), ["mcp", "list"]);
  assert.equal(MCP_SETUPS.cursor.check.command, "agent");
});

test("Cursor writes ~/.cursor/mcp.json under mcpServers", () => {
  const cursor = MCP_SETUPS.cursor as McpJsonFileSetup;

  assert.equal(cursor.kind, "json-file");
  assert.deepEqual(cursor.path, [".cursor", "mcp.json"]);
  assert.equal(cursor.key, "mcpServers");
});

test("Cursor entry for a local server has type, command, args and env, and leaves out empty parts", () => {
  const cursor = MCP_SETUPS.cursor as McpJsonFileSetup;

  assert.deepEqual(cursor.entry(LOCAL), {
    type: "stdio",
    command: "npx",
    args: ["-y", "pkg", "/data"],
    env: { API_KEY: "k", DEBUG: "1" },
  });
  assert.deepEqual(cursor.entry(LOCAL_BARE), { type: "stdio", command: "node" });
});

test("Cursor entry for a remote server has the url and leaves out empty headers", () => {
  const cursor = MCP_SETUPS.cursor as McpJsonFileSetup;

  assert.deepEqual(cursor.entry(REMOTE), {
    url: "https://mcp.example.com/mcp",
    headers: { Authorization: "Bearer t", "X-Id": "7" },
  });
  assert.deepEqual(cursor.entry(REMOTE_BARE), { url: "https://mcp.example.com/mcp" });
});

test("each command line agent removes a server at user scope with its own remove command", () => {
  assert.deepEqual(cli("claude").remove("fs"), ["mcp", "remove", "--scope", "user", "fs"]);
  assert.deepEqual(cli("chatgpt").remove("fs"), ["mcp", "remove", "fs"]);
  assert.deepEqual(cli("gemini").remove("fs"), ["mcp", "remove", "--scope", "user", "fs"]);
  assert.deepEqual(cli("grok").remove("fs"), ["mcp", "remove", "--scope", "user", "fs"]);
});
