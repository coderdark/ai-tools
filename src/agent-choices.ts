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

function skillsFolder({ skillsDir }: ScanResult): string {
  return skillsDir;
}

/** `describe` gives the line shown under the highlighted agent. It defaults to the skills folder. */
export function buildAgentChoices(
  found: ScanResult[],
  describe: (result: ScanResult) => string | undefined = skillsFolder,
): AgentChoice[] {
  const agentChoices = found.map((result) => {
    const description = describe(result);

    return {
      name: result.agent.name,
      value: result.agent.id,
      ...(description === undefined ? {} : { description }),
    };
  });

  return [{ name: "All agents", value: ALL_AGENTS }, ...agentChoices];
}

export function toSelectionRequest(selected: AgentChoiceValue[]): SelectionRequest {
  if (selected.includes(ALL_AGENTS)) {
    return { all: true };
  }

  return { agents: selected };
}
