import { access, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { InstallError, type InstallOutcome, type InstallTarget } from "./install.ts";
import { isValidSkillName } from "./skill.ts";

function destinationOf(name: string, { skillsDir }: InstallTarget): string {
  return join(skillsDir, name);
}

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function isDirectory(path: string): Promise<boolean> {
  const info = await stat(path).catch(() => undefined);

  return Boolean(info?.isDirectory());
}

async function findProblem(name: string, target: InstallTarget): Promise<string | undefined> {
  const destination = destinationOf(name, target);

  if (!(await isDirectory(destination))) {
    return `${target.agent.name}: ${name} is not installed in ${target.skillsDir}`;
  }

  if (!(await pathExists(join(destination, "SKILL.md")))) {
    return `${target.agent.name}: ${destination} has no SKILL.md, so it is not a skill`;
  }

  return undefined;
}

async function findProblems(name: string, targets: InstallTarget[]): Promise<string[]> {
  const problems: string[] = [];

  for (const target of targets) {
    const problem = await findProblem(name, target);

    if (problem) {
      problems.push(problem);
    }
  }

  return problems;
}

export async function uninstallSkill(
  name: string,
  targets: InstallTarget[],
): Promise<InstallOutcome[]> {
  if (!isValidSkillName(name)) {
    throw new InstallError(
      `invalid name "${name}": use 1-64 lowercase letters, numbers, and hyphens`,
    );
  }

  const problems = await findProblems(name, targets);

  if (problems.length > 0) {
    throw new InstallError(problems.join("\n"));
  }

  const outcomes: InstallOutcome[] = [];

  for (const target of targets) {
    const destination = destinationOf(name, target);

    await rm(destination, { recursive: true });
    outcomes.push({ agent: target.agent, destination });
  }

  return outcomes;
}
