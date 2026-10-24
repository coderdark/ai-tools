import chalk, { type ChalkInstance } from "chalk";
import type { ScanResult } from "./agents/scan.ts";
import { formatSkillDetails } from "./format.ts";
import { findInstalledSkills, NO_SKILLS_MESSAGE } from "./list-skills-command.ts";
import type { InstalledSkill } from "./skills/list.ts";

export interface BrowseSkillsPrompts {
  /** Resolves to the chosen skill, or `undefined` when the user chooses to go back. */
  skill(skills: InstalledSkill[]): Promise<InstalledSkill | undefined>;
}

export interface BrowseSkillsDeps {
  scan(): ScanResult[];
  prompts: BrowseSkillsPrompts;
  print(line: string): void;
  colors?: ChalkInstance;
}

export async function runBrowseSkills({
  scan,
  prompts,
  print,
  colors = chalk,
}: BrowseSkillsDeps): Promise<void> {
  const installed = await findInstalledSkills(scan);

  if (installed.length === 0) {
    print(NO_SKILLS_MESSAGE);

    return;
  }

  let skill = await prompts.skill(installed);

  while (skill) {
    for (const line of formatSkillDetails(skill, colors)) {
      print(line);
    }

    print("");
    skill = await prompts.skill(installed);
  }
}
