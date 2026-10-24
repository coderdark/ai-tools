import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { resolve } from "node:path";
import { styleText } from "node:util";
import type { AgentId } from "./agents/registry.ts";
import { buildAgentChoices, toSelectionRequest, type AgentChoiceValue } from "./agent-choices.ts";
import type { BrowseAgentsPrompts } from "./browse-agents-command.ts";
import type { BrowseSkillsPrompts } from "./browse-skills-command.ts";
import { runUntilEscape } from "./escape.ts";
import { formatInstalledIn } from "./format.ts";
import type { InstallPrompts } from "./install-command.ts";
import type { MenuEntry, MenuRequest } from "./menu.ts";
import { readSkill } from "./skills/skill.ts";
import type { UninstallPrompts } from "./uninstall-command.ts";

async function validateSkillDir(value: string): Promise<true | string> {
  return readSkill(resolve(value)).then(
    () => true,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

const LEAVE_ROW = -1;

type SelectConfig<Value> = Parameters<typeof select<Value>>[0];

function keysHelpTipWithEscape(escapeLabel: string) {
  return (keys: [key: string, action: string][]): string => {
    const allKeys: [key: string, action: string][] = [...keys, ["esc", escapeLabel]];

    return allKeys
      .map(([key, action]) => `${styleText("bold", key)} ${styleText("dim", action)}`)
      .join(styleText("dim", " • "));
  };
}

/**
 * A list where Esc cancels the choice, and the footer names what Esc does.
 * Resolves to `undefined` when the user pressed Esc.
 */
function selectWithEscape<Value>(
  config: SelectConfig<Value>,
  escapeLabel = "back",
): Promise<Value | undefined> {
  return runUntilEscape(
    (signal) =>
      select<Value>(
        { ...config, theme: { style: { keysHelpTip: keysHelpTipWithEscape(escapeLabel) } } },
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
    return selectWithEscape<string>(
      {
        message: "Which skill should be removed?",
        choices: skills.map((skill) => ({
          name: skill.name,
          value: skill.name,
          description: formatInstalledIn(skill),
        })),
      },
      "cancel",
    );
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
    const index = await selectWithEscape<number>(
      {
        message: "Which skill do you want to look at?",
        choices: skills.map((skill, position) => ({
          name: skill.name,
          value: position,
          description: formatInstalledIn(skill),
        })),
      },
      "exit",
    );

    return index === undefined ? undefined : skills[index];
  },
};

export const terminalBrowseAgentsPrompts: BrowseAgentsPrompts = {
  async agent(found) {
    const index = await selectWithEscape<number>(
      {
        message: "Which agent do you want to look at?",
        choices: found.map(({ agent, skillsDir }, position) => ({
          name: agent.name,
          value: position,
          description: skillsDir,
        })),
      },
      "exit",
    );

    return index === undefined ? undefined : found[index];
  },
};

export async function chooseMenuEntry({
  title,
  entries,
  isTopLevel,
}: MenuRequest): Promise<MenuEntry | undefined> {
  const choices = entries.map(({ name }, position) => ({ name, value: position }));

  const index = await selectWithEscape<number>(
    {
      message: title,
      choices: isTopLevel ? choices : [...choices, { name: "Back", value: LEAVE_ROW }],
    },
    isTopLevel ? "exit" : "back",
  );

  return index === undefined || index === LEAVE_ROW ? undefined : entries[index];
}
