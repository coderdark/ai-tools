import type { ScanResult } from "./agents/scan.ts";
import type { InstallTarget } from "./skills/install.ts";

export interface SelectionRequest {
  /** Agent ids named with --agent. */
  agents?: string[];
  /** True when --all was given. */
  all?: boolean;
}

export class SelectionError extends Error {}

function toTarget({ agent, skillsDir }: ScanResult): InstallTarget {
  return { agent, skillsDir };
}

function findResult(results: ScanResult[], name: string): ScanResult {
  const result = results.find((candidate) => candidate.agent.id === name);

  if (!result) {
    const valid = results.map((candidate) => candidate.agent.id).join(", ");

    throw new SelectionError(`unknown agent "${name}". Valid agents: ${valid}`);
  }

  if (!result.found) {
    throw new SelectionError(`${result.agent.name} is not installed on this computer`);
  }

  return result;
}

/**
 * Turns the flags and the scan into install targets.
 * Returns undefined when no flag was given, so the caller must ask the user.
 */
export function resolveTargets(
  results: ScanResult[],
  request: SelectionRequest,
): InstallTarget[] | undefined {
  const names = [...new Set(request.agents ?? [])];

  if (request.all && names.length > 0) {
    throw new SelectionError("--agent and --all cannot be used together");
  }

  if (request.all) {
    const found = results.filter((result) => result.found);

    if (found.length === 0) {
      throw new SelectionError("no agents were found on this computer");
    }

    return found.map(toTarget);
  }

  if (names.length === 0) {
    return undefined;
  }

  return names.map((name) => toTarget(findResult(results, name)));
}
