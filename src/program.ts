import { Command } from "commander";
import type { InstallCommandOptions } from "./install-command.ts";

export interface ProgramHandlers {
  install(options: InstallCommandOptions): Promise<void>;
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

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function buildProgram(handlers: ProgramHandlers): Command {
  const program = new Command()
    .name("ai-tools")
    .description("Install skills into the AI agents on this computer.")
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
