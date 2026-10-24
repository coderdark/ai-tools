import { access, cp, realpath, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { Agent } from "../agents/registry.ts";
import type { Skill } from "./skill.ts";

export interface InstallTarget {
  agent: Agent;
  skillsDir: string;
}

export interface InstallOutcome {
  agent: Agent;
  destination: string;
}

export class InstallError extends Error {}

function destinationOf(skill: Skill, { skillsDir }: InstallTarget): string {
  return join(skillsDir, skill.name);
}

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function copySkill(skill: Skill, destination: string): Promise<void> {
  await rm(destination, { recursive: true, force: true });
  await cp(skill.dir, destination, {
    recursive: true,
    filter: (source) => basename(source) !== ".git",
  });
}

async function findExistingDestinations(
  skill: Skill,
  targets: InstallTarget[],
): Promise<string[]> {
  const conflicts: string[] = [];

  for (const target of targets) {
    const destination = destinationOf(skill, target);

    if (await pathExists(destination)) {
      conflicts.push(`${target.agent.name}: ${destination} already exists`);
    }
  }

  return conflicts;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function realPathOrResolved(path: string): Promise<string> {
  return realpath(path).catch(() => resolve(path));
}

async function assertNotInstallingOntoItself(
  skill: Skill,
  targets: InstallTarget[],
): Promise<void> {
  const source = await realPathOrResolved(skill.dir);

  for (const target of targets) {
    const destination = await realPathOrResolved(destinationOf(skill, target));

    if (destination === source) {
      throw new InstallError(
        `${target.agent.name}: ${skill.dir} is already the installed copy ` +
          "(source and destination are the same folder)",
      );
    }
  }
}

export interface InstallOptions {
  /**
   * Replace a destination that already exists. If a later target fails, a
   * destination that was replaced is not restored; only new copies are removed.
   */
  force?: boolean;
  /** Called just before each target is copied, for example to update a spinner. */
  onProgress?: (target: InstallOutcome) => void | Promise<void>;
}

export async function installSkill(
  skill: Skill,
  targets: InstallTarget[],
  options: InstallOptions = {},
): Promise<InstallOutcome[]> {
  await assertNotInstallingOntoItself(skill, targets);

  if (!options.force) {
    const conflicts = await findExistingDestinations(skill, targets);

    if (conflicts.length > 0) {
      throw new InstallError(conflicts.join("\n"));
    }
  }

  const outcomes: InstallOutcome[] = [];
  /** Destinations this call created from nothing, so a failure can remove them. */
  const created: string[] = [];

  for (const target of targets) {
    const { agent } = target;
    const destination = destinationOf(skill, target);
    const existed = await pathExists(destination);

    await options.onProgress?.({ agent, destination });

    try {
      await copySkill(skill, destination);
    } catch (error) {
      const partial = !existed && (await pathExists(destination));
      const toRemove = partial ? [...created, destination] : created;

      await Promise.all(toRemove.map((path) => rm(path, { recursive: true, force: true })));

      throw new InstallError(
        `${agent.name}: could not copy to ${destination} (${errorMessage(error)}); ` +
          `rolled back ${created.length} earlier ${created.length === 1 ? "copy" : "copies"}`,
      );
    }

    if (!existed) {
      created.push(destination);
    }

    outcomes.push({ agent, destination });
  }

  return outcomes;
}
