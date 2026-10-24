import { lstat, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { InstallTarget } from "./install.ts";
import { isValidSkillName } from "./skill.ts";

export interface InstalledTarget extends InstallTarget {
  /** When the skill's folder was created in this agent's skills folder. */
  installedAt: Date;
}

export interface InstalledSkill {
  name: string;
  targets: InstalledTarget[];
}

async function listFolderNames(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function isInstalledSkill(skillsDir: string, name: string): Promise<boolean> {
  if (!isValidSkillName(name)) {
    return false;
  }

  const skillFile = await stat(join(skillsDir, name, "SKILL.md")).catch(() => undefined);

  return Boolean(skillFile?.isFile());
}

export async function listInstalledSkills(targets: InstallTarget[]): Promise<InstalledSkill[]> {
  const byName = new Map<string, InstalledTarget[]>();

  for (const target of targets) {
    const names = await listFolderNames(target.skillsDir);

    for (const name of names) {
      if (await isInstalledSkill(target.skillsDir, name)) {
        const { birthtime } = await lstat(join(target.skillsDir, name));

        byName.set(name, [...(byName.get(name) ?? []), { ...target, installedAt: birthtime }]);
      }
    }
  }

  return [...byName.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([name, found]) => ({ name, targets: found }));
}
