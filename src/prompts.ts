import { checkbox, confirm, input } from "@inquirer/prompts";
import { resolve } from "node:path";
import { buildAgentChoices, toSelectionRequest, type AgentChoiceValue } from "./agent-choices.ts";
import type { InstallPrompts } from "./install-command.ts";
import { readSkill } from "./skills/skill.ts";

async function validateSkillDir(value: string): Promise<true | string> {
  return readSkill(resolve(value)).then(
    () => true,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

export const terminalPrompts: InstallPrompts = {
  async skillDir() {
    const dir = await input({
      message: "Path to the skill folder",
      required: true,
      validate: validateSkillDir,
    });

    return resolve(dir);
  },

  async agents(found) {
    const selected = await checkbox<AgentChoiceValue>({
      message: "Which agents should get this skill?",
      choices: buildAgentChoices(found),
      required: true,
    });

    return toSelectionRequest(selected);
  },

  confirm(skill, agentNames) {
    return confirm({
      message: `Install ${skill.name} into ${agentNames.join(", ")}?`,
      default: true,
    });
  },
};
