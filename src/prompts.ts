import { checkbox, confirm, select } from "@inquirer/prompts";
import { resolve } from "node:path";
import { styleText } from "node:util";
import type { AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { buildAgentChoices, toSelectionRequest, type AgentChoiceValue } from "./agent-choices.ts";
import type { BrowseAgentsPrompts } from "./browse-agents-command.ts";
import type { BrowseSkillsPrompts } from "./browse-skills-command.ts";
import { runUntilEscape } from "./escape.ts";
import { formatAgentChoices, formatInstalledIn } from "./format.ts";
import type { InstallPrompts } from "./install-command.ts";
import type { McpInstallPrompts, McpKind } from "./mcp-install-command.ts";
import type { McpUninstallPrompts } from "./mcp-uninstall-command.ts";
import {
  checkCommandLine,
  checkEnvEntry,
  checkHeaderEntry,
  checkServerName,
  checkUrl,
  describeServer,
} from "./mcp/server.ts";
import type { MenuEntry, MenuRequest } from "./menu.ts";
import type { SelectionRequest } from "./selection.ts";
import { readSkill } from "./skills/skill.ts";
import { textPromptWithFooter, type TextPromptConfig } from "./text-prompt.ts";
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

function askText(
  message: string,
  validate: TextPromptConfig["validate"],
  allowEmpty = false,
): Promise<string | undefined> {
  return withEscape((signal) =>
    textPromptWithFooter(
      { message, footer: keysHelpTipWithEscape("cancel")([["⏎", "submit"]]), validate, allowEmpty },
      { signal },
    ),
  );
}

async function askAgents(
  message: string,
  found: ScanResult[],
  describe?: Parameters<typeof buildAgentChoices>[1],
): Promise<SelectionRequest | undefined> {
  const selected = await withEscape((signal) =>
    checkbox<AgentChoiceValue>(
      {
        message,
        choices: buildAgentChoices(found, describe),
        required: true,
        theme: { style: { keysHelpTip: keysHelpTipWithEscape("cancel") } },
      },
      { signal },
    ),
  );

  return selected === undefined ? undefined : toSelectionRequest(selected);
}

/** Pressing Esc counts as "No". */
async function askYesNo(message: string): Promise<boolean> {
  const answer = await selectWithEscape<boolean>(
    {
      message,
      choices: [
        { name: "Yes", value: true },
        { name: "No", value: false },
      ],
    },
    "cancel",
  );

  return answer ?? false;
}

export const terminalPrompts: InstallPrompts = {
  async skillDir() {
    const dir = await askText("Path to the skill folder", validateSkillDir);

    return dir === undefined ? undefined : resolve(dir);
  },

  agents(found) {
    return askAgents("Which agents should get this skill?", found);
  },

  confirm(skill, agentNames) {
    return askYesNo(`Install ${skill.name} into ${agentNames.join(", ")}?`);
  },
};

export const terminalMcpInstallPrompts: McpInstallPrompts = {
  name() {
    return askText("Name for the MCP server (letters, numbers, - and _)", checkServerName);
  },

  transport() {
    return selectWithEscape<McpKind>(
      {
        message: "What kind of MCP server is it?",
        choices: [
          { name: "Local command", value: "stdio", description: "Starts on this computer, such as npx -y my-mcp-server" },
          { name: "Remote address", value: "http", description: "Lives at an http:// or https:// address" },
        ],
      },
      "cancel",
    );
  },

  commandLine() {
    return askText("Command that starts the server (for example npx -y my-mcp-server)", checkCommandLine);
  },

  url() {
    return askText("Address of the server", checkUrl);
  },

  envEntry() {
    return askText("Environment variable, KEY=value (empty to finish; values are saved as typed)", checkEnvEntry, true);
  },

  headerEntry() {
    return askText("Header, Name: value (empty to finish; values are saved as typed)", checkHeaderEntry, true);
  },

  agents(found) {
    return askAgents("Which agents should get this MCP server?", found, () => undefined);
  },

  confirm(server, agentNames) {
    return askYesNo(`Install MCP server ${server.name} (${describeServer(server)}) into ${agentNames.join(", ")}?`);
  },
};

export const terminalMcpUninstallPrompts: McpUninstallPrompts = {
  name() {
    return askText("Name of the MCP server to remove", checkServerName);
  },

  agents(name, candidates) {
    const places = new Map(
      candidates.map(({ agent, presence }) => [
        agent.id,
        presence.state === "present" ? (presence.place.savedIn ?? presence.place.note) : undefined,
      ]),
    );
    const found = candidates.map(({ agent }) => ({ agent, found: true, skillsDir: "" }));

    return askAgents(`Remove ${name} from which agents?`, found, ({ agent }) => places.get(agent.id));
  },

  confirm(name, agentNames) {
    return askYesNo(`Remove MCP server ${name} from ${agentNames.join(", ")}?`);
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
