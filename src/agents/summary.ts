import type { InstalledSkill } from "../skills/list.ts";
import type { Agent } from "./registry.ts";
import type { ScanResult } from "./scan.ts";

export interface AgentSummary {
  agent: Agent;
  skillsDir: string;
  skillCount: number;
}

export function summarizeAgents(found: ScanResult[], skills: InstalledSkill[]): AgentSummary[] {
  return found.map(({ agent, skillsDir }) => ({
    agent,
    skillsDir,
    skillCount: skills.filter(({ targets }) => targets.some((target) => target.agent.id === agent.id))
      .length,
  }));
}
