import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { parse } from "yaml";

export interface Skill {
  name: string;
  description: string;
  dir: string;
}

export class SkillError extends Error {}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const VALID_NAME = /^[a-z0-9-]{1,64}$/;

async function assertDirectory(dir: string): Promise<void> {
  const info = await stat(dir).catch(() => undefined);

  if (!info?.isDirectory()) {
    throw new SkillError(`${dir} is not a directory`);
  }
}

async function readSkillFile(dir: string): Promise<string> {
  try {
    return await readFile(join(dir, "SKILL.md"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SkillError(`${dir} has no SKILL.md`);
    }

    throw error;
  }
}

export async function readSkill(dir: string): Promise<Skill> {
  await assertDirectory(dir);

  const text = await readSkillFile(dir);
  const match = FRONTMATTER.exec(text);
  const data = (parse(match?.[1] ?? "") ?? {}) as { name?: unknown; description?: unknown };
  const name = String(data.name ?? basename(dir));
  const description = String(data.description ?? "").trim();

  if (!VALID_NAME.test(name)) {
    throw new SkillError(
      `invalid name "${name}": use 1-64 lowercase letters, numbers, and hyphens`,
    );
  }

  if (description === "") {
    throw new SkillError(`${dir}: SKILL.md needs a non-empty description`);
  }

  return { name, description, dir };
}
