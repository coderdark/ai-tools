import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, lstat, mkdir, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeTempRoot } from "../test-support.ts";
import {
  addToJsonConfig,
  checkJsonConfig,
  listJsonConfig,
  McpConfigError,
  removeFromJsonConfig,
} from "./json-config.ts";

const ENTRY = { type: "stdio", command: "npx", args: ["-y", "pkg"] };

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

test("addToJsonConfig creates the file and its folder when they are missing", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, ".cursor", "mcp.json");

  await addToJsonConfig(path, "mcpServers", "fs", ENTRY);

  assert.deepEqual(await readJson(path), { mcpServers: { fs: ENTRY } });
  assert.equal((await readFile(path, "utf8")).endsWith("}\n"), true);
});

test("addToJsonConfig makes a new file private to the user, because it may hold secrets", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  await addToJsonConfig(path, "mcpServers", "fs", ENTRY);

  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test("addToJsonConfig keeps the other keys and the other servers", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  await writeFile(path, JSON.stringify({ theme: "dark", mcpServers: { old: { url: "https://x.example" } } }));
  await addToJsonConfig(path, "mcpServers", "fs", ENTRY);

  assert.deepEqual(await readJson(path), {
    theme: "dark",
    mcpServers: { old: { url: "https://x.example" }, fs: ENTRY },
  });
});

test("addToJsonConfig creates the servers object when the file does not have one", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  await writeFile(path, JSON.stringify({ theme: "dark" }));
  await addToJsonConfig(path, "mcpServers", "fs", ENTRY);

  assert.deepEqual(await readJson(path), { theme: "dark", mcpServers: { fs: ENTRY } });
});

test("addToJsonConfig keeps the permissions of a file that already exists", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  await writeFile(path, "{}");
  await chmod(path, 0o640);
  await addToJsonConfig(path, "mcpServers", "fs", ENTRY);

  assert.equal((await stat(path)).mode & 0o777, 0o640);
});

test("addToJsonConfig leaves no temporary file behind", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  await addToJsonConfig(path, "mcpServers", "fs", ENTRY);

  assert.deepEqual(await readdir(root), ["mcp.json"]);
});

test("addToJsonConfig writes through a symbolic link and keeps the link", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const target = join(root, "dotfiles", "mcp.json");
  const link = join(root, "home", "mcp.json");

  await mkdir(join(root, "dotfiles"));
  await mkdir(join(root, "home"));
  await writeFile(target, "{}");
  await symlink(target, link);
  await addToJsonConfig(link, "mcpServers", "fs", ENTRY);

  assert.equal((await lstat(link)).isSymbolicLink(), true);
  assert.deepEqual(await readJson(target), { mcpServers: { fs: ENTRY } });
});

test("addToJsonConfig refuses a file that is not valid JSON and leaves it unchanged", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");
  const original = '{\n  // my servers\n  "mcpServers": {}\n}\n';

  await writeFile(path, original);

  await assert.rejects(addToJsonConfig(path, "mcpServers", "fs", ENTRY), (error) => {
    assert.ok(error instanceof McpConfigError);
    assert.match(error.message, /not valid JSON/);
    assert.match(error.message, /left unchanged/);

    return true;
  });
  assert.equal(await readFile(path, "utf8"), original);
});

test("addToJsonConfig refuses a file whose top level or servers entry is not an object", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  for (const original of ["[]", "null", '{"mcpServers": []}', '{"mcpServers": "x"}']) {
    await writeFile(path, original);

    await assert.rejects(addToJsonConfig(path, "mcpServers", "fs", ENTRY), McpConfigError, original);
    assert.equal(await readFile(path, "utf8"), original);
  }
});

test("addToJsonConfig never replaces a server that already has the name", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");
  const original = JSON.stringify({ mcpServers: { fs: { url: "https://old.example" } } });

  await writeFile(path, original);

  await assert.rejects(addToJsonConfig(path, "mcpServers", "fs", ENTRY), (error) => {
    assert.ok(error instanceof McpConfigError);
    assert.match(error.message, /already has a server named "fs"/);

    return true;
  });
  assert.equal(await readFile(path, "utf8"), original);
});

test("checkJsonConfig says the name is free when the file is missing or does not have it", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  assert.deepEqual(await checkJsonConfig(path, "mcpServers", "fs"), { state: "free" });

  await writeFile(path, JSON.stringify({ mcpServers: { other: {} } }));

  assert.deepEqual(await checkJsonConfig(path, "mcpServers", "fs"), { state: "free" });
});

test("checkJsonConfig says when the name already exists, and changes nothing", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");
  const text = JSON.stringify({ mcpServers: { fs: {} } });

  await writeFile(path, text);

  assert.deepEqual(await checkJsonConfig(path, "mcpServers", "fs"), { state: "exists" });
  assert.equal(await readFile(path, "utf8"), text);
});

test("checkJsonConfig says why a file cannot be used, and changes nothing", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  await writeFile(path, "not json");

  const result = await checkJsonConfig(path, "mcpServers", "fs");

  assert.equal(result.state, "unreadable");
  assert.match(String("message" in result ? result.message : ""), /not valid JSON/);
  assert.equal(await readFile(path, "utf8"), "not json");
});

test("removeFromJsonConfig removes only that server and keeps everything else", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  await writeFile(path, JSON.stringify({ theme: "dark", mcpServers: { fs: ENTRY, other: { url: "https://x.test" } } }));

  assert.equal(await removeFromJsonConfig(path, "mcpServers", "fs"), true);
  assert.deepEqual(await readJson(path), { theme: "dark", mcpServers: { other: { url: "https://x.test" } } });
});

test("removeFromJsonConfig leaves an empty server list when the last server goes", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  await writeFile(path, JSON.stringify({ mcpServers: { fs: ENTRY } }));
  await removeFromJsonConfig(path, "mcpServers", "fs");

  assert.deepEqual(await readJson(path), { mcpServers: {} });
});

test("removeFromJsonConfig says false, and creates nothing, when the file or the name is missing", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const missing = join(root, "missing.json");
  const path = join(root, "mcp.json");
  const text = JSON.stringify({ mcpServers: { other: {} } });

  await writeFile(path, text);

  assert.equal(await removeFromJsonConfig(missing, "mcpServers", "fs"), false);
  assert.deepEqual(await readdir(root), ["mcp.json"]);
  assert.equal(await removeFromJsonConfig(path, "mcpServers", "fs"), false);
  assert.equal(await readFile(path, "utf8"), text);
});

test("removeFromJsonConfig refuses a file that is not JSON, and leaves it unchanged", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  await writeFile(path, "// comment\n{}");

  await assert.rejects(removeFromJsonConfig(path, "mcpServers", "fs"), McpConfigError);
  assert.equal(await readFile(path, "utf8"), "// comment\n{}");
});

test("removeFromJsonConfig keeps the file's permissions and writes through a symlink", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const real = join(root, "real.json");
  const link = join(root, "link.json");

  await writeFile(real, JSON.stringify({ mcpServers: { fs: ENTRY } }));
  await chmod(real, 0o640);
  await symlink(real, link);
  await removeFromJsonConfig(link, "mcpServers", "fs");

  assert.equal((await lstat(link)).isSymbolicLink(), true);
  assert.deepEqual(await readJson(real), { mcpServers: {} });
  assert.equal((await stat(real)).mode & 0o777, 0o640);
});

test("listJsonConfig gives each server's name and entry, and ignores everything else in the file", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  await writeFile(path, JSON.stringify({ theme: "dark", mcpServers: { fs: ENTRY, api: { url: "https://x.test" } } }));

  assert.deepEqual(await listJsonConfig(path, "mcpServers"), [
    { name: "fs", entry: ENTRY },
    { name: "api", entry: { url: "https://x.test" } },
  ]);
});

test("listJsonConfig gives an empty list when the file or the servers are missing, and creates nothing", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  await writeFile(path, JSON.stringify({ theme: "dark" }));

  assert.deepEqual(await listJsonConfig(join(root, "missing.json"), "mcpServers"), []);
  assert.deepEqual(await listJsonConfig(path, "mcpServers"), []);
  assert.deepEqual(await readdir(root), ["mcp.json"]);
});

test("listJsonConfig refuses a file it cannot read, and leaves it unchanged", async (t) => {
  const root = await makeTempRoot(t, "ai-toolbox-json-");
  const path = join(root, "mcp.json");

  await writeFile(path, "not json");

  await assert.rejects(listJsonConfig(path, "mcpServers"), McpConfigError);
  assert.equal(await readFile(path, "utf8"), "not json");
});
