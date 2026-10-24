import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { resolve } from "node:path";
import type { AgentId } from "./agents/registry.ts";
import { buildAgentChoices, toSelectionRequest, type AgentChoiceValue } from "./agent-choices.ts";
import type { InstallPrompts } from "./install-command.ts";
import { readSkill } from "./skills/skill.ts";
import type { UninstallPrompts } from "./uninstall-command.ts";

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

export const terminalUninstallPrompts: UninstallPrompts = {
  skill(skills) {
    return select({
      message: "Which skill should be removed?",
      choices: skills.map(({ name, targets }) => ({
        name,
        value: name,
        description: `Installed in ${targets.map(({ agent }) => agent.name).join(", ")}`,
      })),
    });
  },

  agents(skill) {
    return checkbox<AgentId>({
      message: `Remove ${skill.name} from which agents?`,
      choices: skill.targets.map(({ agent, skillsDir }) => ({
        name: agent.name,
        value: agent.id,
        description: skillsDir,
        checked: true,
      })),
      required: true,
    });
  },

  confirm(name, agentNames) {
    return confirm({
      message: `Remove ${name} from ${agentNames.join(", ")}? This cannot be undone.`,
      default: false,
    });
  },
};
