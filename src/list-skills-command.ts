import chalk, { type ChalkInstance } from "chalk";
import type { ScanResult } from "./agents/scan.ts";
import { formatSkillList } from "./format.ts";
import { SelectionError } from "./selection.ts";
import { listInstalledSkills, type InstalledSkill } from "./skills/list.ts";

export interface ListSkillsDeps {
  scan(): ScanResult[];
  print(line: string): void;
  colors?: ChalkInstance;
}

export const NO_SKILLS_MESSAGE = "No skills are installed in the agents that were found.";

export async function findInstalledSkills(scan: () => ScanResult[]): Promise<InstalledSkill[]> {
  const found = scan().filter((result) => result.found);

  if (found.length === 0) {
    throw new SelectionError("no agents were found on this computer");
  }

  return listInstalledSkills(found);
}

export async function runListSkills({ scan, print, colors = chalk }: ListSkillsDeps): Promise<void> {
  const installed = await findInstalledSkills(scan);

  if (installed.length === 0) {
    print(NO_SKILLS_MESSAGE);

    return;
  }

  for (const line of formatSkillList(installed, colors)) {
    print(line);
  }
}
