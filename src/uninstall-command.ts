import chalk, { type ChalkInstance } from "chalk";
import type { AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { formatOutcomes, UsageError, type InstallProgress } from "./install-command.ts";
import { SelectionError } from "./selection.ts";
import type { InstallOutcome, InstallTarget } from "./skills/install.ts";
import { listInstalledSkills, type InstalledSkill } from "./skills/list.ts";
import { uninstallSkill } from "./skills/uninstall.ts";

export interface UninstallPrompts {
  /** Resolves to the chosen skill's name, or `undefined` when the user cancels the choice. */
  skill(skills: InstalledSkill[]): Promise<string | undefined>;
  agents(skill: InstalledSkill): Promise<AgentId[]>;
  confirm(name: string, agentNames: string[]): Promise<boolean>;
}

export interface UninstallCommandDeps {
  scan(): ScanResult[];
  prompts: UninstallPrompts;
  progress: InstallProgress;
  print(line: string): void;
  interactive: boolean;
  colors?: ChalkInstance;
}

export const CANCELLED_MESSAGE = "Cancelled. Nothing was removed.";

async function chooseSkill(
  installed: InstalledSkill[],
  { prompts }: UninstallCommandDeps,
): Promise<InstalledSkill | undefined> {
  const name = await prompts.skill(installed);

  if (name === undefined) {
    return undefined;
  }

  const skill = installed.find((candidate) => candidate.name === name);

  if (!skill) {
    throw new SelectionError(`${name} is not one of the installed skills`);
  }

  return skill;
}

async function chooseTargets(
  skill: InstalledSkill,
  { prompts }: UninstallCommandDeps,
): Promise<InstallTarget[]> {
  const agentIds = await prompts.agents(skill);
  const targets = skill.targets.filter(({ agent }) => agentIds.includes(agent.id));

  if (targets.length === 0) {
    throw new SelectionError("choose at least one agent");
  }

  return targets;
}

async function removeWithProgress(
  name: string,
  targets: InstallTarget[],
  progress: InstallProgress,
): Promise<InstallOutcome[]> {
  progress.start(`Removing ${name}...`);

  try {
    return await uninstallSkill(name, targets);
  } catch (error) {
    progress.fail(`Could not remove ${name}`);

    throw error;
  }
}

export async function runUninstall(deps: UninstallCommandDeps): Promise<void> {
  const { prompts, progress, print, colors = chalk } = deps;
  const found = deps.scan().filter((result) => result.found);

  if (found.length === 0) {
    throw new SelectionError("no agents were found on this computer");
  }

  if (!deps.interactive) {
    throw new UsageError("uninstall needs a terminal, because you choose the skill from a list");
  }

  const installed = await listInstalledSkills(found);

  if (installed.length === 0) {
    print("No skills are installed in the agents that were found.");

    return;
  }

  const skill = await chooseSkill(installed, deps);

  if (!skill) {
    print(CANCELLED_MESSAGE);

    return;
  }

  const targets = await chooseTargets(skill, deps);

  const confirmed = await prompts.confirm(
    skill.name,
    targets.map(({ agent }) => agent.name),
  );

  if (!confirmed) {
    print(CANCELLED_MESSAGE);

    return;
  }

  const outcomes = await removeWithProgress(skill.name, targets, progress);
  const agentCount = `${outcomes.length} ${outcomes.length === 1 ? "agent" : "agents"}`;

  progress.succeed(`Removed ${skill.name} from ${agentCount}`);

  for (const line of formatOutcomes(outcomes, colors)) {
    print(line);
  }
}
