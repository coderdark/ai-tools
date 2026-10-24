import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { defaultScanEnv, isOnPath, scanAgents, type ScanEnv } from "./scan.ts";

async function makeEnv(t: TestContext): Promise<ScanEnv> {
  const root = await mkdtemp(join(tmpdir(), "ai-toolbox-scan-"));
  const home = join(root, "home");
  const bin = join(root, "bin");
  const apps = join(root, "apps");

  await Promise.all([mkdir(home), mkdir(bin), mkdir(apps)]);
  t.after(() => rm(root, { recursive: true, force: true }));

  return { home, pathDirs: [bin], appDirs: [apps] };
}

test("with nothing installed, all five agents are reported as not found", async (t) => {
  const env = await makeEnv(t);
  const results = scanAgents(env);

  assert.deepEqual(
    results.map((result) => [result.agent.id, result.found]),
    [
      ["cursor", false],
      ["claude", false],
      ["chatgpt", false],
      ["gemini", false],
      ["grok", false],
    ],
  );
});

test("each agent reports its user skills directory under the home folder", async (t) => {
  const env = await makeEnv(t);
  const results = scanAgents(env);

  assert.deepEqual(
    results.map((result) => result.skillsDir),
    [
      join(env.home, ".cursor", "skills"),
      join(env.home, ".claude", "skills"),
      join(env.home, ".codex", "skills"),
      join(env.home, ".gemini", "skills"),
      join(env.home, ".grok", "skills"),
    ],
  );
});

function foundIds(env: ScanEnv): string[] {
  return scanAgents(env)
    .filter((result) => result.found)
    .map((result) => result.agent.id);
}

test("an agent is found when its config directory exists in the home folder", async (t) => {
  const env = await makeEnv(t);

  await mkdir(join(env.home, ".claude"));

  assert.deepEqual(foundIds(env), ["claude"]);
});

async function writeCommand(dir: string, name: string, mode: number): Promise<void> {
  const file = join(dir, name);

  await writeFile(file, "#!/bin/sh\n");
  await chmod(file, mode);
}

test("an agent is found when its command is an executable file on PATH", async (t) => {
  const env = await makeEnv(t);

  await writeCommand(env.pathDirs[0]!, "codex", 0o755);

  assert.deepEqual(foundIds(env), ["chatgpt"]);
});

test("a file on PATH that is not executable does not count as the command", async (t) => {
  const env = await makeEnv(t);

  await writeCommand(env.pathDirs[0]!, "codex", 0o644);

  assert.deepEqual(foundIds(env), []);
});

test("an agent is found when its app bundle is in an Applications folder", async (t) => {
  const env = await makeEnv(t);

  await mkdir(join(env.appDirs[0]!, "Cursor.app"));

  assert.deepEqual(foundIds(env), ["cursor"]);
});

test("defaultScanEnv splits PATH and adds the system and user Applications folders", () => {
  const env = defaultScanEnv({ PATH: ["/usr/bin", "/opt/bin"].join(delimiter) }, "/Users/someone");

  assert.deepEqual(env, {
    home: "/Users/someone",
    pathDirs: ["/usr/bin", "/opt/bin"],
    appDirs: ["/Applications", join("/Users/someone", "Applications")],
  });
});

test("defaultScanEnv ignores empty PATH entries and a missing PATH", () => {
  const withGaps = defaultScanEnv({ PATH: ["", "/usr/bin", ""].join(delimiter) }, "/h");
  const missing = defaultScanEnv({}, "/h");

  assert.deepEqual(withGaps.pathDirs, ["/usr/bin"]);
  assert.deepEqual(missing.pathDirs, []);
});

// Regression guards for the "never write here" rules in PLAN.md.
test("no agent installs into the shared ~/.agents/skills directory", async (t) => {
  const env = await makeEnv(t);
  const shared = join(env.home, ".agents", "skills");

  for (const result of scanAgents(env)) {
    assert.notEqual(result.skillsDir, shared);
  }
});

test("Cursor installs into skills, never into Cursor's built-in skills-cursor", async (t) => {
  const env = await makeEnv(t);
  const cursor = scanAgents(env).find((result) => result.agent.id === "cursor");

  assert.equal(cursor?.skillsDir, join(env.home, ".cursor", "skills"));
  assert.ok(!cursor?.skillsDir.includes("skills-cursor"));
});

test("isOnPath finds an executable file in any of the folders, and ignores other entries", async (t) => {
  const env = await makeEnv(t);
  const [bin] = env.pathDirs;

  assert.ok(bin);

  await writeFile(join(bin, "tool"), "#!/bin/sh\n");
  await chmod(join(bin, "tool"), 0o755);
  await writeFile(join(bin, "plain"), "text");
  await chmod(join(bin, "plain"), 0o644);
  await mkdir(join(bin, "folder"));

  assert.equal(isOnPath("tool", [join(bin, "missing"), bin]), true);
  assert.equal(isOnPath("plain", [bin]), false);
  assert.equal(isOnPath("folder", [bin]), false);
  assert.equal(isOnPath("absent", [bin]), false);
  assert.equal(isOnPath("tool", []), false);
});
