import chalk, { type ChalkInstance } from "chalk";
import type { Agent } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { UsageError, type InstallProgress } from "./install-command.ts";
import { assertCanPrompt, assertValid, countAgents, oneLine } from "./mcp-install-command.ts";
import { checkServerName } from "./mcp/server.ts";
import type { McpFound, McpRemovalOutcome } from "./mcp/uninstall.ts";
import { resolveTargets, SelectionError, type SelectionRequest } from "./selection.ts";
import { InstallError } from "./skills/install.ts";
import { CANCELLED_MESSAGE } from "./uninstall-command.ts";

export interface McpUninstallOptions {
  name?: string;
  agents?: string[];
  all?: boolean;
  yes?: boolean;
}

/** Every prompt resolves to `undefined` when the user cancels. */
export interface McpUninstallPrompts {
  name(): Promise<string | undefined>;
  /** Only the agents that have the server are offered. */
  agents(name: string, candidates: McpFound[]): Promise<SelectionRequest | undefined>;
  confirm(name: string, agentNames: string[]): Promise<boolean>;
}

export interface McpUninstallDeps {
  scan(): ScanResult[];
  prompts: McpUninstallPrompts;
  progress: InstallProgress;
  print(line: string): void;
  interactive: boolean;
  colors?: ChalkInstance;
  find(name: string, agents: Agent[]): Promise<McpFound[]>;
  uninstall(name: string, found: McpFound[], onProgress: (agent: Agent) => void): Promise<McpRemovalOutcome[]>;
}

function isPresent({ presence }: McpFound): boolean {
  return presence.state === "present";
}

function toScanResult({ agent }: McpFound): ScanResult {
  return { agent, found: true, skillsDir: "" };
}

async function chooseName(options: McpUninstallOptions, deps: McpUninstallDeps): Promise<string | undefined> {
  if (options.name !== undefined) {
    assertValid(checkServerName(options.name), "name");

    return options.name;
  }

  assertCanPrompt(deps, "pass the server name as an argument");

  return deps.prompts.name();
}

async function pickFromCandidates(name: string, candidates: McpFound[], deps: McpUninstallDeps): Promise<McpFound[] | undefined> {
  assertCanPrompt(deps, "choose agents with --agent or --all");

  const request = await deps.prompts.agents(name, candidates);

  if (!request) {
    return undefined;
  }

  const picked = resolveTargets(candidates.map(toScanResult), request);

  if (!picked) {
    throw new SelectionError("choose at least one agent");
  }

  const ids = new Set(picked.map(({ agent }) => agent.id));

  return candidates.filter(({ agent }) => ids.has(agent.id));
}

/**
 * The agents to remove the server from, with what each one has.
 * Agents named by flags are all kept, so one without the server shows as "not installed".
 */
async function chooseEntries(
  name: string,
  options: McpUninstallOptions,
  deps: McpUninstallDeps,
  results: ScanResult[],
  found: ScanResult[],
): Promise<McpFound[] | undefined> {
  const flagTargets = resolveTargets(results, options);

  if (flagTargets) {
    return deps.find(name, flagTargets.map(({ agent }) => agent));
  }

  const entries = await deps.find(name, found.map(({ agent }) => agent));
  const candidates = entries.filter(isPresent);

  return candidates.length === 0 ? entries : pickFromCandidates(name, candidates, deps);
}

async function isConfirmed(
  name: string,
  options: McpUninstallOptions,
  deps: McpUninstallDeps,
  entries: McpFound[],
): Promise<boolean> {
  const removing = entries.filter(isPresent);

  if (removing.length === 0 || options.yes) {
    return true;
  }

  assertCanPrompt(deps, "pass --yes to confirm");

  return deps.prompts.confirm(
    name,
    removing.map(({ agent }) => agent.name),
  );
}

function describeRemoval(outcome: McpRemovalOutcome): string {
  switch (outcome.status) {
    case "removed":
      return outcome.savedIn ? `uninstalled from ${outcome.savedIn}` : "uninstalled";
    case "not-installed":
      return "not installed";
    case "failed":
      return `failed: ${oneLine(outcome.detail)}`;
    case "skipped":
      return `skipped: ${oneLine(outcome.detail)}`;
  }
}

function markOf({ status }: McpRemovalOutcome, colors: ChalkInstance): string {
  return status === "failed" || status === "skipped" ? colors.red("✖") : colors.green("✔");
}

export function formatMcpRemovals(outcomes: McpRemovalOutcome[], colors: ChalkInstance): string[] {
  const nameWidth = Math.max(...outcomes.map(({ agent }) => agent.name.length));

  return outcomes.map(
    (outcome) => `${markOf(outcome, colors)} ${outcome.agent.name.padEnd(nameWidth)}  ${describeRemoval(outcome)}`,
  );
}

async function uninstallWithProgress(
  name: string,
  entries: McpFound[],
  { uninstall, progress }: McpUninstallDeps,
): Promise<McpRemovalOutcome[]> {
  progress.start(`Uninstalling ${name}...`);

  try {
    return await uninstall(name, entries, (agent) => progress.update(`Uninstalling ${name} from ${agent.name}...`));
  } catch (error) {
    progress.fail(`Could not uninstall ${name}`);

    throw error;
  }
}

function summarizeSuccess(name: string, outcomes: McpRemovalOutcome[]): string {
  const removed = outcomes.filter(({ status }) => status === "removed").length;
  const missing = outcomes.length - removed;

  if (removed === 0) {
    return `${name} is not installed in ${countAgents(missing)}`;
  }

  const uninstalled = `Uninstalled ${name} from ${countAgents(removed)}`;

  return missing === 0 ? uninstalled : `${uninstalled}; ${missing} did not have it`;
}

function isProblem({ status }: McpRemovalOutcome): boolean {
  return status === "failed" || status === "skipped";
}

export async function runMcpUninstall(options: McpUninstallOptions, deps: McpUninstallDeps): Promise<void> {
  const { progress, print, colors = chalk } = deps;
  const results = deps.scan();
  const found = results.filter((result) => result.found);

  if (found.length === 0) {
    throw new SelectionError("no agents were found on this computer");
  }

  const name = await chooseName(options, deps);
  const entries = name === undefined ? undefined : await chooseEntries(name, options, deps, results, found);

  if (name === undefined || !entries || !(await isConfirmed(name, options, deps, entries))) {
    print(CANCELLED_MESSAGE);

    return;
  }

  const outcomes = await uninstallWithProgress(name, entries, deps);
  const problems = outcomes.filter(isProblem);

  if (problems.length === 0) {
    progress.succeed(summarizeSuccess(name, outcomes));
  } else {
    progress.fail(`Could not uninstall ${name} from ${problems.length} of ${countAgents(outcomes.length)}`);
  }

  for (const line of formatMcpRemovals(outcomes, colors)) {
    print(line);
  }

  if (problems.length > 0) {
    throw new InstallError(`${name} was not uninstalled from ${problems.map(({ agent }) => agent.name).join(", ")}`);
  }
}
