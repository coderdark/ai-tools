import type { AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import type { SelectionRequest } from "./selection.ts";

export const ALL_AGENTS = "all";

export type AgentChoiceValue = AgentId | typeof ALL_AGENTS;

export interface AgentChoice {
  name: string;
  value: AgentChoiceValue;
  description?: string;
}

export function buildAgentChoices(found: ScanResult[]): AgentChoice[] {
  const agentChoices = found.map(({ agent, skillsDir }) => ({
    name: agent.name,
    value: agent.id,
    description: skillsDir,
  }));

  return [{ name: "All agents", value: ALL_AGENTS }, ...agentChoices];
}

export function toSelectionRequest(selected: AgentChoiceValue[]): SelectionRequest {
  if (selected.includes(ALL_AGENTS)) {
    return { all: true };
  }

  return { agents: selected };
}
