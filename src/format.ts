import chalk, { type ChalkInstance } from "chalk";
import type { ScanResult } from "./agents/scan.ts";

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
