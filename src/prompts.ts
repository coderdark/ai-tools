import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { resolve } from "node:path";
import { styleText } from "node:util";
import type { AgentId } from "./agents/registry.ts";
import { buildAgentChoices, toSelectionRequest, type AgentChoiceValue } from "./agent-choices.ts";
import type { BrowseSkillsPrompts } from "./browse-skills-command.ts";
import { runUntilEscape } from "./escape.ts";
import type { InstallPrompts } from "./install-command.ts";
import type { InstalledSkill } from "./skills/list.ts";
import { readSkill } from "./skills/skill.ts";
import type { UninstallPrompts } from "./uninstall-command.ts";

async function validateSkillDir(value: string): Promise<true | string> {
  return readSkill(resolve(value)).then(
    () => true,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

function describeInstalledIn({ targets }: InstalledSkill): string {
  return `Installed in ${targets.map(({ agent }) => agent.name).join(", ")}`;
}

const BACK = -1;

function keysHelpTipWithEscape(keys: [key: string, action: string][]): string {
  const allKeys: [key: string, action: string][] = [...keys, ["esc", "back"]];

  return allKeys
    .map(([key, action]) => `${styleText("bold", key)} ${styleText("dim", action)}`)
    .join(styleText("dim", " • "));
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
      choices: skills.map((skill) => ({
        name: skill.name,
        value: skill.name,
        description: describeInstalledIn(skill),
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

export const terminalBrowsePrompts: BrowseSkillsPrompts = {
  async skill(skills) {
    const index = await runUntilEscape(
      (signal) =>
        select<number>(
          {
            message: "Which skill do you want to look at?",
            choices: [
              ...skills.map((skill, position) => ({
                name: skill.name,
                value: position,
                description: describeInstalledIn(skill),
              })),
              { name: "Back", value: BACK },
            ],
            theme: { style: { keysHelpTip: keysHelpTipWithEscape } },
          },
          { signal },
        ),
      process.stdin,
    );

    return index === undefined ? undefined : skills[index];
  },
};
