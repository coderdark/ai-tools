import type { ScanResult } from "./agents/scan.ts";
import { SelectionError } from "./selection.ts";

export function findFoundAgents(scan: () => ScanResult[]): ScanResult[] {
  const found = scan().filter((result) => result.found);

  if (found.length === 0) {
    throw new SelectionError("no agents were found on this computer");
  }

  return found;
}
