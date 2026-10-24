import chalk, { type ChalkInstance } from "chalk";
import type { ScanResult } from "./agents/scan.ts";
import { summarizeAgents, type AgentSummary } from "./agents/summary.ts";
import { findFoundAgents } from "./found-agents.ts";
import { formatAgentDetails } from "./format.ts";
import { listInstalledSkills } from "./skills/list.ts";

export interface BrowseAgentsPrompts {
  /** Resolves to the chosen agent, or `undefined` when the user leaves the list. */
  agent(summaries: AgentSummary[]): Promise<AgentSummary | undefined>;
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
  const found = findFoundAgents(scan);
  const skills = await listInstalledSkills(found.map(({ agent, skillsDir }) => ({ agent, skillsDir })));
  const chosen = await prompts.agent(summarizeAgents(found, skills));

  if (!chosen) {
    return;
  }

  for (const line of formatAgentDetails(chosen, skills, colors)) {
    print(line);
  }
}
