import type { TestContext } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Creates a temporary folder that is removed when the test finishes. */
export async function makeTempRoot(t: TestContext, prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));

  t.after(() => rm(root, { recursive: true, force: true }));

  return root;
}

/** Writes `files` (paths may be nested, such as "scripts/run.sh") under `dir`. */
export async function writeFiles(dir: string, files: Record<string, string>): Promise<void> {
  for (const [file, contents] of Object.entries(files)) {
    const path = join(dir, file);

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }
}

/** Creates a skill folder named `folder` containing `files`, and returns its path. */
export async function makeSkillDir(
  t: TestContext,
  folder: string,
  files: Record<string, string>,
): Promise<string> {
  const root = await makeTempRoot(t, "ai-toolbox-skill-");
  const dir = join(root, folder);

  await writeFiles(dir, files);

  return dir;
}
