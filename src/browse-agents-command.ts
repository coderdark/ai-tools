import chalk, { type ChalkInstance } from "chalk";
import type { ScanResult } from "./agents/scan.ts";
import { findFoundAgents } from "./found-agents.ts";
import { formatAgentDetails } from "./format.ts";
import { listInstalledSkills } from "./skills/list.ts";

export interface BrowseAgentsPrompts {
  /** Resolves to the chosen agent, or `undefined` when the user leaves the list. */
  agent(found: ScanResult[]): Promise<ScanResult | undefined>;
}

export interface BrowseAgentsDeps {
  scan(): ScanResult[];
  prompts: BrowseAgentsPrompts;
  print(line: string): void;
  colors?: ChalkInstance;
}

export async function runBrowseAgents({
  scan,
  prompts,
  print,
  colors = chalk,
}: BrowseAgentsDeps): Promise<void> {
  const chosen = await prompts.agent(findFoundAgents(scan));

  if (!chosen) {
    return;
  }

  const target = { agent: chosen.agent, skillsDir: chosen.skillsDir };
  const skills = await listInstalledSkills([target]);

  for (const line of formatAgentDetails(target, skills, colors)) {
    print(line);
  }
}
