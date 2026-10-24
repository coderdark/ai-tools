#!/usr/bin/env node
import { select } from "@inquirer/prompts";
import { defaultScanEnv, scanAgents } from "./agents/scan.ts";
import { createColors } from "./colors.ts";
import { formatAgentList } from "./format.ts";
import { runInstall, type InstallCommandOptions } from "./install-command.ts";
import { runListSkills } from "./list-skills-command.ts";
import { runMenu, type MenuEntry, type MenuRequest } from "./menu.ts";
import { createProgress } from "./progress.ts";
import { buildProgram, type ProgramHandlers } from "./program.ts";
import { terminalPrompts, terminalUninstallPrompts } from "./prompts.ts";
import { runCli } from "./run-cli.ts";
import { runUninstall } from "./uninstall-command.ts";

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

function uninstall(): Promise<void> {
  return runUninstall({
    scan,
    prompts: terminalUninstallPrompts,
    progress: createProgress(),
    print,
    interactive,
    colors,
  });
}

function skills(): Promise<void> {
  return runListSkills({ scan, print, colors });
}

async function agents(): Promise<void> {
  for (const line of formatAgentList(scan(), colors)) {
    print(line);
  }
}

const menuEntries: MenuEntry[] = [
  {
    name: "Skills",
    entries: [
      { name: "List skills", run: skills },
      { name: "Install a skill", run: () => install({}) },
      { name: "Uninstall a skill", run: uninstall },
    ],
  },
  { name: "Agents", run: agents },
];

const LEAVE_MENU = -1;

async function chooseMenuEntry({ title, entries, leaveLabel }: MenuRequest): Promise<MenuEntry | undefined> {
  const index = await select<number>({
    message: title,
    choices: [
      ...entries.map(({ name }, position) => ({ name, value: position })),
      { name: leaveLabel, value: LEAVE_MENU },
    ],
  });

  return index === LEAVE_MENU ? undefined : entries[index];
}

function menu(): Promise<void> {
  return runMenu({
    title: "What would you like to do?",
    entries: menuEntries,
    choose: chooseMenuEntry,
    interactive,
    print,
    printError: (line) => console.error(line),
    colors,
  });
}

const handlers: ProgramHandlers = { install, agents, uninstall, skills, menu };

process.exitCode = await runCli(buildProgram(handlers), process.argv.slice(2), {
  error: (line) => console.error(line),
  colors,
});
