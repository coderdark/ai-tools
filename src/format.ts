import { join } from "node:path";
import chalk, { type ChalkInstance } from "chalk";
import type { ScanResult } from "./agents/scan.ts";
import type { InstalledSkill } from "./skills/list.ts";

export function formatAgentList(
  results: ScanResult[],
  colors: ChalkInstance = chalk,
): string[] {
  const nameWidth = Math.max(...results.map((result) => result.agent.name.length));

  return results.map(({ agent, found, skillsDir }) => {
    const status = (found ? "found" : "missing").padEnd(7);
    const name = agent.name.padEnd(nameWidth);

    if (!found) {
      return colors.dim(`${status}  ${name}  ${skillsDir}`);
    }

    return `${colors.green(status)}  ${name}  ${colors.cyan(skillsDir)}`;
  });
}

export function formatSkillDetails(
  { name, targets }: InstalledSkill,
  colors: ChalkInstance = chalk,
): string[] {
  const nameWidth = Math.max(...targets.map(({ agent }) => agent.name.length));

  const folders = targets.map(
    ({ agent, skillsDir }) =>
      `  ${agent.name.padEnd(nameWidth)}  ${colors.cyan(join(skillsDir, name))}`,
  );

  return [name, ...folders];
}

export function formatSkillList(skills: InstalledSkill[], colors: ChalkInstance = chalk): string[] {
  const nameWidth = Math.max(...skills.map((skill) => skill.name.length));

  return skills.map(({ name, targets }) => {
    const agentNames = targets.map(({ agent }) => agent.name).join(", ");

    return `${name.padEnd(nameWidth)}  ${colors.dim(agentNames)}`;
  });
}
