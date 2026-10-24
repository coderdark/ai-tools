import { join } from "node:path";
import chalk, { type ChalkInstance } from "chalk";
import type { ScanResult } from "./agents/scan.ts";
import type { AgentSummary } from "./agents/summary.ts";
import { formatDateTime } from "./date-time.ts";
import type { InstallTarget } from "./skills/install.ts";
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
    ({ agent, skillsDir, installedAt }) =>
      `  ${agent.name.padEnd(nameWidth)}  ${colors.dim(formatDateTime(installedAt))}  ${colors.cyan(join(skillsDir, name))}`,
  );

  return [name, ...folders];
}

export function formatAgentChoices(summaries: AgentSummary[]): string[] {
  const nameWidth = Math.max(...summaries.map(({ agent }) => agent.name.length));

  return summaries.map(({ agent, skillCount }) => {
    const noun = skillCount === 1 ? "skill" : "skills";

    return `${agent.name.padEnd(nameWidth)}  ${skillCount} ${noun}`;
  });
}

export function formatAgentDetails(
  { agent, skillsDir }: InstallTarget,
  skills: InstalledSkill[],
  colors: ChalkInstance = chalk,
): string[] {
  const header = `${agent.name}  ${colors.cyan(skillsDir)}`;

  const rows = skills.flatMap(({ name, targets }) =>
    targets
      .filter((target) => target.agent.id === agent.id)
      .map(({ installedAt }) => ({ name, installedAt })),
  );

  if (rows.length === 0) {
    return [header, `  ${colors.dim("No skills installed")}`];
  }

  const nameWidth = Math.max(...rows.map(({ name }) => name.length));

  return [
    header,
    ...rows.map(
      ({ name, installedAt }) =>
        `  ${name.padEnd(nameWidth)}  ${colors.dim(formatDateTime(installedAt))}`,
    ),
  ];
}

export function formatInstalledIn({ targets }: InstalledSkill): string {
  const agentsByDate = new Map<string, string[]>();

  for (const { agent, installedAt } of targets) {
    const date = formatDateTime(installedAt);

    agentsByDate.set(date, [...(agentsByDate.get(date) ?? []), agent.name]);
  }

  const groups = [...agentsByDate].map(([date, names]) => `${names.join(", ")} on ${date}`);

  return `Installed in ${groups.join("; ")}`;
}

export function formatSkillList(skills: InstalledSkill[], colors: ChalkInstance = chalk): string[] {
  const nameWidth = Math.max(...skills.map((skill) => skill.name.length));

  return skills.map(({ name, targets }) => {
    const agentNames = targets.map(({ agent }) => agent.name).join(", ");

    return `${name.padEnd(nameWidth)}  ${colors.dim(agentNames)}`;
  });
}
