import chalk, { type ChalkInstance } from "chalk";
import type { AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { resolveTargets, SelectionError, type SelectionRequest } from "./selection.ts";
import { installSkill, type InstallOutcome, type InstallTarget } from "./skills/install.ts";
import { readSkill, type Skill } from "./skills/skill.ts";

export class UsageError extends Error {}

export interface InstallCommandOptions {
  skillDir?: string;
  agents?: string[];
  all?: boolean;
  force?: boolean;
  yes?: boolean;
}

export interface InstallPrompts {
  /** Resolves to the folder path, or `undefined` when the user cancels. */
  skillDir(): Promise<string | undefined>;
  /** Resolves to the chosen agents, or `undefined` when the user cancels. */
  agents(found: ScanResult[]): Promise<SelectionRequest | undefined>;
  confirm(skill: Skill, agentNames: string[]): Promise<boolean>;
}

export interface InstallProgress {
  start(text: string): void;
  update(text: string): void;
  succeed(text: string): void;
  fail(text: string): void;
}

export interface InstallCommandDeps {
  scan(): ScanResult[];
  prompts: InstallPrompts;
  progress: InstallProgress;
  print(line: string): void;
  interactive: boolean;
  colors?: ChalkInstance;
}

function assertCanPrompt({ interactive }: InstallCommandDeps, instead: string): void {
  if (!interactive) {
    throw new UsageError(`${instead} when not running in a terminal`);
  }
}

const AGENTS_READ_BY_CURSOR: AgentId[] = ["claude", "chatgpt"];

function formatCursorNotes(
  skill: Skill,
  targets: InstallTarget[],
  found: ScanResult[],
  colors: ChalkInstance,
): string[] {
  const hasCursor = found.some(({ agent }) => agent.id === "cursor");
  const cursorChosen = targets.some(({ agent }) => agent.id === "cursor");

  if (!hasCursor || cursorChosen) {
    return [];
  }

  return targets
    .filter(({ agent }) => AGENTS_READ_BY_CURSOR.includes(agent.id))
    .map(({ skillsDir }) =>
      colors.dim(`Cursor also reads ${skillsDir}, so it will see ${skill.name} there too.`),
    );
}

export function formatOutcomes(outcomes: InstallOutcome[], colors: ChalkInstance): string[] {
  const nameWidth = Math.max(...outcomes.map(({ agent }) => agent.name.length));

  return outcomes.map(
    ({ agent, destination }) =>
      `${colors.green("✔")} ${agent.name.padEnd(nameWidth)}  ${colors.cyan(destination)}`,
  );
}

export const CANCELLED_MESSAGE = "Cancelled. Nothing was installed.";

async function chooseSkill(
  options: InstallCommandOptions,
  deps: InstallCommandDeps,
): Promise<Skill | undefined> {
  if (options.skillDir) {
    return readSkill(options.skillDir);
  }

  assertCanPrompt(deps, "pass the skill folder as an argument");

  const skillDir = await deps.prompts.skillDir();

  return skillDir === undefined ? undefined : readSkill(skillDir);
}

async function chooseTargets(
  options: InstallCommandOptions,
  deps: InstallCommandDeps,
  results: ScanResult[],
  found: ScanResult[],
): Promise<InstallTarget[] | undefined> {
  let targets = resolveTargets(results, options);

  if (!targets) {
    assertCanPrompt(deps, "choose agents with --agent or --all");

    const request = await deps.prompts.agents(found);

    if (!request) {
      return undefined;
    }

    targets = resolveTargets(results, request);
  }

  if (!targets) {
    throw new SelectionError("choose at least one agent");
  }

  return targets;
}

async function isConfirmed(
  options: InstallCommandOptions,
  deps: InstallCommandDeps,
  skill: Skill,
  targets: InstallTarget[],
): Promise<boolean> {
  if (options.yes) {
    return true;
  }

  assertCanPrompt(deps, "pass --yes to confirm");

  return deps.prompts.confirm(
    skill,
    targets.map(({ agent }) => agent.name),
  );
}

async function installWithProgress(
  skill: Skill,
  targets: InstallTarget[],
  force: boolean | undefined,
  progress: InstallProgress,
): Promise<InstallOutcome[]> {
  progress.start(`Installing ${skill.name}...`);

  try {
    return await installSkill(skill, targets, {
      force,
      onProgress: ({ agent }) => progress.update(`Installing ${skill.name} into ${agent.name}...`),
    });
  } catch (error) {
    progress.fail(`Could not install ${skill.name}`);

    throw error;
  }
}

export async function runInstall(
  options: InstallCommandOptions,
  deps: InstallCommandDeps,
): Promise<void> {
  const { progress, print, colors = chalk } = deps;
  const results = deps.scan();
  const found = results.filter((result) => result.found);

  if (found.length === 0) {
    throw new SelectionError("no agents were found on this computer");
  }

  const skill = await chooseSkill(options, deps);

  if (!skill) {
    print(CANCELLED_MESSAGE);

    return;
  }

  const targets = await chooseTargets(options, deps, results, found);

  if (!targets) {
    print(CANCELLED_MESSAGE);

    return;
  }

  if (!(await isConfirmed(options, deps, skill, targets))) {
    print(CANCELLED_MESSAGE);

    return;
  }

  const outcomes = await installWithProgress(skill, targets, options.force, progress);

  const agentCount = `${outcomes.length} ${outcomes.length === 1 ? "agent" : "agents"}`;

  progress.succeed(`Installed ${skill.name} into ${agentCount}`);
  const lines = [
    ...formatOutcomes(outcomes, colors),
    ...formatCursorNotes(skill, targets, found, colors),
  ];

  for (const line of lines) {
    print(line);
  }
}
