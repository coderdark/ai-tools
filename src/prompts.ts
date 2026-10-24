import { checkbox, confirm, select } from "@inquirer/prompts";
import { resolve } from "node:path";
import { styleText } from "node:util";
import type { AgentId } from "./agents/registry.ts";
import { buildAgentChoices, toSelectionRequest, type AgentChoiceValue } from "./agent-choices.ts";
import type { BrowseAgentsPrompts } from "./browse-agents-command.ts";
import type { BrowseSkillsPrompts } from "./browse-skills-command.ts";
import { runUntilEscape } from "./escape.ts";
import { formatAgentChoices, formatInstalledIn } from "./format.ts";
import type { InstallPrompts } from "./install-command.ts";
import type { MenuEntry, MenuRequest } from "./menu.ts";
import { readSkill } from "./skills/skill.ts";
import { textPromptWithFooter } from "./text-prompt.ts";
import type { UninstallPrompts } from "./uninstall-command.ts";

async function validateSkillDir(value: string): Promise<true | string> {
  return readSkill(resolve(value)).then(
    () => true,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

type SelectConfig<Value> = Parameters<typeof select<Value>>[0];

function keysHelpTipWithEscape(escapeLabel: string) {
  return (keys: [key: string, action: string][]): string => {
    const allKeys: [key: string, action: string][] = [...keys, ["esc", escapeLabel]];

    return allKeys
      .map(([key, action]) => `${styleText("bold", key)} ${styleText("dim", action)}`)
      .join(styleText("dim", " • "));
  };
}

/** Runs a prompt that Esc cancels. Resolves to `undefined` when the user pressed Esc. */
function withEscape<Value>(run: (signal: AbortSignal) => Promise<Value>): Promise<Value | undefined> {
  return runUntilEscape(run, process.stdin);
}

/** A list where Esc cancels the choice, and the footer names what Esc does. */
function selectWithEscape<Value>(
  config: SelectConfig<Value>,
  escapeLabel: string,
): Promise<Value | undefined> {
  return withEscape((signal) =>
    select<Value>(
      { ...config, theme: { style: { keysHelpTip: keysHelpTipWithEscape(escapeLabel) } } },
      { signal },
    ),
  );
}

export const terminalPrompts: InstallPrompts = {
  async skillDir() {
    const dir = await withEscape((signal) =>
      textPromptWithFooter(
        {
          message: "Path to the skill folder",
          footer: keysHelpTipWithEscape("cancel")([["⏎", "submit"]]),
          validate: validateSkillDir,
        },
        { signal },
      ),
    );

    return dir === undefined ? undefined : resolve(dir);
  },

  async agents(found) {
    const selected = await withEscape((signal) =>
      checkbox<AgentChoiceValue>(
        {
          message: "Which agents should get this skill?",
          choices: buildAgentChoices(found),
          required: true,
          theme: { style: { keysHelpTip: keysHelpTipWithEscape("cancel") } },
        },
        { signal },
      ),
    );

    return selected === undefined ? undefined : toSelectionRequest(selected);
  },

  async confirm(skill, agentNames) {
    const confirmed = await selectWithEscape<boolean>(
      {
        message: `Install ${skill.name} into ${agentNames.join(", ")}?`,
        choices: [
          { name: "Yes", value: true },
          { name: "No", value: false },
        ],
      },
      "cancel",
    );

    return confirmed ?? false;
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
      "cancel",
    );

    return index === undefined ? undefined : skills[index];
  },
};

export const terminalBrowseAgentsPrompts: BrowseAgentsPrompts = {
  async agent(summaries) {
    const labels = formatAgentChoices(summaries);

    const index = await selectWithEscape<number>(
      {
        message: "Which agent do you want to look at?",
        choices: summaries.map(({ skillsDir }, position) => ({
          name: labels[position] ?? "",
          value: position,
          description: skillsDir,
        })),
      },
      "cancel",
    );

    return index === undefined ? undefined : summaries[index];
  },
};

export async function chooseMenuEntry({
  title,
  entries,
  isTopLevel,
}: MenuRequest): Promise<MenuEntry | undefined> {
  const index = await selectWithEscape<number>(
    {
      message: title,
      choices: entries.map(({ name }, position) => ({ name, value: position })),
    },
    isTopLevel ? "exit" : "cancel",
  );

  return index === undefined ? undefined : entries[index];
}
