import chalk, { type ChalkInstance } from "chalk";
import type { ScanResult } from "./agents/scan.ts";
import { findFoundAgents } from "./found-agents.ts";
import { formatSkillList } from "./format.ts";
import { listInstalledSkills, type InstalledSkill } from "./skills/list.ts";

export interface ListSkillsDeps {
  scan(): ScanResult[];
  print(line: string): void;
  colors?: ChalkInstance;
}

export const NO_SKILLS_MESSAGE = "No skills are installed in the agents that were found.";

export async function findInstalledSkills(scan: () => ScanResult[]): Promise<InstalledSkill[]> {
  return listInstalledSkills(findFoundAgents(scan));
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
