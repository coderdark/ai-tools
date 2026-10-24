#!/usr/bin/env node
import { defaultScanEnv, scanAgents } from "./agents/scan.ts";
import { runBrowseAgents } from "./browse-agents-command.ts";
import { runBrowseSkills } from "./browse-skills-command.ts";
import { createColors } from "./colors.ts";
import { formatAgentList } from "./format.ts";
import { runInstall, type InstallCommandOptions } from "./install-command.ts";
import { runListSkills } from "./list-skills-command.ts";
import { runMenu, type MenuEntry } from "./menu.ts";
import { createProgress } from "./progress.ts";
import { buildProgram, type ProgramHandlers } from "./program.ts";
import {
  chooseMenuEntry,
  terminalBrowseAgentsPrompts,
  terminalBrowsePrompts,
  terminalPrompts,
  terminalUninstallPrompts,
} from "./prompts.ts";
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

function browseSkills(): Promise<void> {
  return runBrowseSkills({ scan, prompts: terminalBrowsePrompts, print, colors });
}

function browseAgents(): Promise<void> {
  return runBrowseAgents({ scan, prompts: terminalBrowseAgentsPrompts, print, colors });
}

async function agents(): Promise<void> {
  for (const line of formatAgentList(scan(), colors)) {
    print(line);
  }
}

const menuEntries: MenuEntry[] = [
  { name: "Agents", run: browseAgents },
  {
    name: "Skills",
    entries: [
      { name: "List skills", run: browseSkills },
      { name: "Install a skill", run: () => install({}) },
      { name: "Uninstall a skill", run: uninstall },
    ],
  },
];

function menu(): Promise<void> {
  return runMenu({
    title: "What would you like to do?",
    entries: menuEntries,
    choose: chooseMenuEntry,
    interactive,
  });
}

const handlers: ProgramHandlers = { install, agents, uninstall, skills, menu };

process.exitCode = await runCli(buildProgram(handlers), process.argv.slice(2), {
  error: (line) => console.error(line),
  colors,
});
