import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { resolve } from "node:path";
import { styleText } from "node:util";
import type { AgentId } from "./agents/registry.ts";
import { buildAgentChoices, toSelectionRequest, type AgentChoiceValue } from "./agent-choices.ts";
import type { BrowseSkillsPrompts } from "./browse-skills-command.ts";
import { runUntilEscape } from "./escape.ts";
import type { InstallPrompts } from "./install-command.ts";
import type { MenuEntry, MenuRequest } from "./menu.ts";
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

const LEAVE_ROW = -1;

type SelectConfig<Value> = Parameters<typeof select<Value>>[0];

function keysHelpTipWithEscape(keys: [key: string, action: string][]): string {
  const allKeys: [key: string, action: string][] = [...keys, ["esc", "back"]];

  return allKeys
    .map(([key, action]) => `${styleText("bold", key)} ${styleText("dim", action)}`)
    .join(styleText("dim", " • "));
}

/** A list where Esc cancels the choice. Resolves to `undefined` when the user pressed Esc. */
function selectWithEscape<Value>(config: SelectConfig<Value>): Promise<Value | undefined> {
  return runUntilEscape(
    (signal) =>
      select<Value>(
        { ...config, theme: { style: { keysHelpTip: keysHelpTipWithEscape } } },
        { signal },
      ),
    process.stdin,
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
    return selectWithEscape<string>({
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
    const index = await selectWithEscape<number>({
      message: "Which skill do you want to look at?",
      choices: skills.map((skill, position) => ({
        name: skill.name,
        value: position,
        description: describeInstalledIn(skill),
      })),
    });

    return index === undefined ? undefined : skills[index];
  },
};

export async function chooseMenuEntry({
  title,
  entries,
  leaveLabel,
  canGoBack,
}: MenuRequest): Promise<MenuEntry | undefined> {
  const config: SelectConfig<number> = {
    message: title,
    choices: [
      ...entries.map(({ name }, position) => ({ name, value: position })),
      { name: leaveLabel, value: LEAVE_ROW },
    ],
  };

  const index = canGoBack ? await selectWithEscape<number>(config) : await select<number>(config);

  return index === undefined || index === LEAVE_ROW ? undefined : entries[index];
}
