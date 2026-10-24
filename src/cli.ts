#!/usr/bin/env node
import { select } from "@inquirer/prompts";
import { defaultScanEnv, scanAgents } from "./agents/scan.ts";
import { createColors } from "./colors.ts";
import { formatAgentList } from "./format.ts";
import { runInstall, type InstallCommandOptions } from "./install-command.ts";
import { createProgress } from "./progress.ts";
import { buildProgram, type ProgramHandlers } from "./program.ts";
import { terminalPrompts } from "./prompts.ts";
import { runCli } from "./run-cli.ts";

const colors = createColors();
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

function scan() {
  return scanAgents(defaultScanEnv());
}

function print(line: string): void {
  console.log(line);
}

function install(options: InstallCommandOptions): Promise<void> {
  return runInstall(options, {
    scan,
    prompts: terminalPrompts,
    progress: createProgress(),
    print,
    interactive,
    colors,
  });
}

async function agents(): Promise<void> {
  for (const line of formatAgentList(scan(), colors)) {
    print(line);
  }
}

async function menu(): Promise<void> {
  const choice = await select({
    message: "What would you like to do?",
    choices: [
      { name: "Install a skill", value: "install" },
      { name: "Show agents", value: "agents" },
    ],
  });

  if (choice === "install") {
    await install({});

    return;
  }

  await agents();
}

const handlers: ProgramHandlers = { install, agents, menu };

process.exitCode = await runCli(buildProgram(handlers), process.argv.slice(2), {
  error: (line) => console.error(line),
  colors,
});
