import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkCommandLine,
  checkEnvEntry,
  checkHeaderEntry,
  checkServerName,
  checkUrl,
  describeServer,
  splitCommandLine,
  toEnv,
  toHeaders,
  type McpServer,
} from "./server.ts";

test("checkServerName accepts letters, numbers, hyphens and underscores up to 64 characters", () => {
  for (const name of ["filesystem", "my-server", "Server_2", "a", "x".repeat(64)]) {
    assert.equal(checkServerName(name), true, name);
  }
});

test("checkServerName explains why a name is not accepted", () => {
  for (const name of ["", "my server", "a.b", "-x/y", "x".repeat(65), "../etc"]) {
    const result = checkServerName(name);

    assert.equal(typeof result, "string", name);
    assert.match(String(result), /letters, numbers, hyphens and underscores/);
  }
});

test("checkUrl accepts http and https addresses", () => {
  assert.equal(checkUrl("https://mcp.example.com/mcp"), true);
  assert.equal(checkUrl("http://localhost:3000/mcp"), true);
});

test("checkUrl rejects other schemes and text that is not an address", () => {
  for (const url of ["", "mcp.example.com", "ftp://example.com", "file:///tmp/x", "https://"]) {
    assert.match(String(checkUrl(url)), /http:\/\/ or https:\/\//, url);
  }
});

test("checkEnvEntry accepts KEY=value, including an empty value or a value that contains =", () => {
  for (const entry of ["API_KEY=abc", "DEBUG=", "URL=https://x?a=b", "_x1=1"]) {
    assert.equal(checkEnvEntry(entry), true, entry);
  }
});

test("checkEnvEntry rejects an entry without a valid name", () => {
  for (const entry of ["", "novalue", "=x", "1BAD=x", "A B=x", "A-B=x"]) {
    assert.match(String(checkEnvEntry(entry)), /KEY=value/, entry);
  }
});

test("checkHeaderEntry accepts \"Name: value\"", () => {
  assert.equal(checkHeaderEntry("Authorization: Bearer ${TOKEN}"), true);
  assert.equal(checkHeaderEntry("X-Api-Key:abc"), true);
});

test("checkHeaderEntry rejects an entry without a valid name or without a value", () => {
  for (const entry of ["", "novalue", ": x", "Bad Name: x", "Name:", "Name:   "]) {
    assert.match(String(checkHeaderEntry(entry)), /Name: value/, entry);
  }
});

test("toEnv splits each entry at the first = and keeps the rest as the value", () => {
  assert.deepEqual(toEnv(["A=1", "URL=https://x?a=b", "EMPTY="]), {
    A: "1",
    URL: "https://x?a=b",
    EMPTY: "",
  });
});

test("toHeaders splits each entry at the first colon and trims the value", () => {
  assert.deepEqual(toHeaders(["Authorization: Bearer x:y", "X-Id:  7 "]), {
    Authorization: "Bearer x:y",
    "X-Id": "7",
  });
});

test("splitCommandLine splits on spaces and keeps quoted text together", () => {
  assert.deepEqual(splitCommandLine('npx -y @scope/pkg "my folder" --flag="a b"'), [
    "npx",
    "-y",
    "@scope/pkg",
    "my folder",
    "--flag=a b",
  ]);
});

test("splitCommandLine rejects an empty command line", () => {
  assert.throws(() => splitCommandLine("   "), /command/i);
});

test("describeServer names the command, its argument count and the variable names, never the values", () => {
  const server: McpServer = {
    name: "fs",
    transport: {
      kind: "stdio",
      command: "npx",
      args: ["-y", "pkg", "--token=secret-in-arg"],
      env: { API_KEY: "secret-value", DEBUG: "1" },
    },
  };
  const text = describeServer(server);

  assert.equal(text, "npx with 3 arguments, variables API_KEY, DEBUG");
  assert.doesNotMatch(text, /secret/);
});

test("describeServer says \"1 argument\" and leaves out empty parts", () => {
  const server: McpServer = {
    name: "fs",
    transport: { kind: "stdio", command: "node", args: ["server.js"], env: {} },
  };

  assert.equal(describeServer(server), "node with 1 argument");
  assert.equal(
    describeServer({ name: "x", transport: { kind: "stdio", command: "node", args: [], env: {} } }),
    "node",
  );
});

test("describeServer shows only the address of a remote server and the header names", () => {
  const server: McpServer = {
    name: "api",
    transport: {
      kind: "http",
      url: "https://mcp.example.com/path?token=secret-in-url",
      headers: { Authorization: "Bearer secret-value" },
    },
  };
  const text = describeServer(server);

  assert.equal(text, "https://mcp.example.com, headers Authorization");
  assert.doesNotMatch(text, /secret/);
});

test("checkCommandLine accepts a command with or without arguments", () => {
  assert.equal(checkCommandLine("node"), true);
  assert.equal(checkCommandLine('npx -y "my pkg"'), true);
});

test("checkCommandLine rejects an empty or blank command line", () => {
  for (const line of ["", "   "]) {
    assert.match(String(checkCommandLine(line)), /Enter a command/, JSON.stringify(line));
  }
});

test("the header message does not suggest that every agent expands ${VAR} references", () => {
  assert.doesNotMatch(String(checkHeaderEntry("nocolon")), /\$\{/);
});
