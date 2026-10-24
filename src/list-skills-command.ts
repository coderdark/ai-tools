import chalk, { type ChalkInstance } from "chalk";
import type { ScanResult } from "./agents/scan.ts";
import { formatSkillList } from "./format.ts";
import { SelectionError } from "./selection.ts";
import { listInstalledSkills } from "./skills/list.ts";

export interface ListSkillsDeps {
  scan(): ScanResult[];
  print(line: string): void;
  colors?: ChalkInstance;
}

export async function runListSkills({ scan, print, colors = chalk }: ListSkillsDeps): Promise<void> {
  const found = scan().filter((result) => result.found);

  if (found.length === 0) {
    throw new SelectionError("no agents were found on this computer");
  }

  const installed = await listInstalledSkills(found);

  if (installed.length === 0) {
    print("No skills are installed in the agents that were found.");

    return;
  }

  for (const line of formatSkillList(installed, colors)) {
    print(line);
  }
}
