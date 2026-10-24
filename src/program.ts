import { Command } from "commander";
import type { InstallCommandOptions } from "./install-command.ts";
import type { McpInstallOptions } from "./mcp-install-command.ts";
import type { McpUninstallOptions } from "./mcp-uninstall-command.ts";

export interface ProgramHandlers {
  install(options: InstallCommandOptions): Promise<void>;
  mcpInstall(options: McpInstallOptions): Promise<void>;
  mcpUninstall(options: McpUninstallOptions): Promise<void>;
  mcpList(): Promise<void>;
  agents(): Promise<void>;
  uninstall(): Promise<void>;
  skills(): Promise<void>;
  menu(): Promise<void>;
}

interface InstallFlags {
  agent: string[];
  all?: boolean;
  force?: boolean;
  yes?: boolean;
}

interface McpInstallFlags {
  url?: string;
  env: string[];
  header: string[];
  agent: string[];
  all?: boolean;
  yes?: boolean;
}

interface McpUninstallFlags {
  agent: string[];
  all?: boolean;
  yes?: boolean;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function buildProgram(handlers: ProgramHandlers): Command {
  const program = new Command()
    .name("ai-tools")
    .description("Manage the skills and MCP servers of the AI agents on this computer.")
    .action(handlers.menu);

  program
    .command("agents")
    .description("List the AI agents found on this computer.")
    .action(handlers.agents);

  program
    .command("install")
    .description("Install a skill folder into one or more agents.")
    .argument("[skill-dir]", "folder that contains SKILL.md")
    .option("--agent <id>", "agent to install into (repeat for several)", collect, [])
    .option("--all", "install into every agent that was found")
    .option("--yes", "skip the confirmation")
    .option("--force", "replace a skill that is already installed")
    .action((skillDir: string | undefined, flags: InstallFlags) =>
      handlers.install({
        skillDir,
        agents: flags.agent,
        all: Boolean(flags.all),
        force: Boolean(flags.force),
        yes: Boolean(flags.yes),
      }),
    );

  const mcp = program
    .command("mcp")
    .description("Manage the MCP servers of the AI agents on this computer.");

  mcp
    .command("list")
    .description("List the MCP servers of the AI agents on this computer.")
    .action(handlers.mcpList);

  mcp
    .command("install")
    .description("Install an MCP server into one or more agents.")
    .argument("[name]", "name for the server")
    .argument("[command...]", "command and arguments that start a local server, written after --")
    .option("--url <address>", "address of a remote server, instead of a command")
    .option("--env <KEY=value>", "variable for a local server (repeat for several)", collect, [])
    .option("--header <header>", 'header for a remote server, as "Name: value" (repeat for several)', collect, [])
    .option("--agent <id>", "agent to install into (repeat for several)", collect, [])
    .option("--all", "install into every agent that was found")
    .option("--yes", "skip the confirmation")
    .action((name: string | undefined, command: string[], flags: McpInstallFlags) =>
      handlers.mcpInstall({
        name,
        url: flags.url,
        command,
        env: flags.env,
        headers: flags.header,
        agents: flags.agent,
        all: Boolean(flags.all),
        yes: Boolean(flags.yes),
      }),
    );

  mcp
    .command("uninstall")
    .description("Remove an MCP server from one or more agents.")
    .argument("[name]", "name of the server")
    .option("--agent <id>", "agent to remove it from (repeat for several)", collect, [])
    .option("--all", "remove it from every agent that was found")
    .option("--yes", "skip the confirmation")
    .action((name: string | undefined, flags: McpUninstallFlags) =>
      handlers.mcpUninstall({ name, agents: flags.agent, all: Boolean(flags.all), yes: Boolean(flags.yes) }),
    );

  program
    .command("skills")
    .description("List the skills installed in the AI agents on this computer.")
    .action(handlers.skills);

  program
    .command("uninstall")
    .description("Remove an installed skill from one or more agents.")
    .action(handlers.uninstall);

  return program;
}
