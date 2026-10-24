import chalk, { type ChalkInstance } from "chalk";
import type { Agent } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { CANCELLED_MESSAGE, UsageError, type InstallProgress } from "./install-command.ts";
import type { McpOutcome } from "./mcp/install.ts";
import {
  checkEnvEntry,
  checkHeaderEntry,
  checkServerName,
  checkUrl,
  splitCommandLine,
  toEnv,
  toHeaders,
  type McpServer,
  type McpTransport,
} from "./mcp/server.ts";
import { resolveTargets, SelectionError, type SelectionRequest } from "./selection.ts";
import { InstallError } from "./skills/install.ts";

export interface McpInstallOptions {
  name?: string;
  url?: string;
  /** The command and its arguments, as given after `--`. */
  command?: string[];
  env?: string[];
  headers?: string[];
  agents?: string[];
  all?: boolean;
  yes?: boolean;
}

export type McpKind = "stdio" | "http";

/** Every prompt resolves to `undefined` when the user cancels. */
export interface McpInstallPrompts {
  name(): Promise<string | undefined>;
  transport(): Promise<McpKind | undefined>;
  commandLine(): Promise<string | undefined>;
  url(): Promise<string | undefined>;
  /** Resolves to an empty string when the user has no more variables to add. */
  envEntry(): Promise<string | undefined>;
  /** Resolves to an empty string when the user has no more headers to add. */
  headerEntry(): Promise<string | undefined>;
  agents(found: ScanResult[]): Promise<SelectionRequest | undefined>;
  confirm(server: McpServer, agentNames: string[]): Promise<boolean>;
}

export interface McpInstallDeps {
  scan(): ScanResult[];
  prompts: McpInstallPrompts;
  progress: InstallProgress;
  print(line: string): void;
  interactive: boolean;
  colors?: ChalkInstance;
  install(server: McpServer, agents: Agent[], onProgress: (agent: Agent) => void): Promise<McpOutcome[]>;
}

function assertCanPrompt({ interactive }: McpInstallDeps, instead: string): void {
  if (!interactive) {
    throw new UsageError(`${instead} when not running in a terminal`);
  }
}

function assertValid(result: true | string, label: string): void {
  if (result !== true) {
    throw new UsageError(`${label}: ${result}`);
  }
}

function assertAllValid(entries: string[], check: (entry: string) => true | string, label: string): void {
  for (const entry of entries) {
    assertValid(check(entry), label);
  }
}

async function collectEntries(ask: () => Promise<string | undefined>): Promise<string[] | undefined> {
  const entries: string[] = [];

  for (;;) {
    const entry = await ask();

    if (entry === undefined) {
      return undefined;
    }

    if (entry === "") {
      return entries;
    }

    entries.push(entry);
  }
}

async function chooseName(options: McpInstallOptions, deps: McpInstallDeps): Promise<string | undefined> {
  if (options.name !== undefined) {
    assertValid(checkServerName(options.name), "name");

    return options.name;
  }

  assertCanPrompt(deps, "pass the server name as an argument");

  return deps.prompts.name();
}

function kindFromFlags({ url, command }: McpInstallOptions): McpKind | undefined {
  const hasCommand = (command?.length ?? 0) > 0;

  if (url !== undefined && hasCommand) {
    throw new UsageError("Use either --url or a command, not both.");
  }

  if (url !== undefined) {
    return "http";
  }

  return hasCommand ? "stdio" : undefined;
}

async function chooseKind(options: McpInstallOptions, deps: McpInstallDeps): Promise<McpKind | undefined> {
  const fromFlags = kindFromFlags(options);

  if (fromFlags) {
    return fromFlags;
  }

  assertCanPrompt(deps, "pass --url or a command after --");

  return deps.prompts.transport();
}

async function chooseCommand(options: McpInstallOptions, deps: McpInstallDeps): Promise<string[] | undefined> {
  if (options.command?.length) {
    return options.command;
  }

  const commandLine = await deps.prompts.commandLine();

  return commandLine === undefined ? undefined : splitCommandLine(commandLine);
}

async function buildStdio(options: McpInstallOptions, deps: McpInstallDeps): Promise<McpTransport | undefined> {
  if (options.headers?.length) {
    throw new UsageError("--header only works with --url");
  }

  const flagEntries = options.env ?? [];
  const commandGiven = Boolean(options.command?.length);

  assertAllValid(flagEntries, checkEnvEntry, "--env");

  const parts = await chooseCommand(options, deps);

  if (!parts) {
    return undefined;
  }

  const askedEntries = commandGiven ? [] : await collectEntries(deps.prompts.envEntry);

  if (!askedEntries) {
    return undefined;
  }

  const [command = "", ...args] = parts;

  return { kind: "stdio", command, args, env: toEnv([...flagEntries, ...askedEntries]) };
}

async function buildHttp(options: McpInstallOptions, deps: McpInstallDeps): Promise<McpTransport | undefined> {
  if (options.env?.length) {
    throw new UsageError("--env only works with a command");
  }

  const flagEntries = options.headers ?? [];

  assertAllValid(flagEntries, checkHeaderEntry, "--header");

  if (options.url !== undefined) {
    assertValid(checkUrl(options.url), "--url");
  }

  const url = options.url ?? (await deps.prompts.url());

  if (url === undefined) {
    return undefined;
  }

  const askedEntries = options.url !== undefined ? [] : await collectEntries(deps.prompts.headerEntry);

  if (!askedEntries) {
    return undefined;
  }

  return { kind: "http", url, headers: toHeaders([...flagEntries, ...askedEntries]) };
}

async function chooseServer(options: McpInstallOptions, deps: McpInstallDeps): Promise<McpServer | undefined> {
  const name = await chooseName(options, deps);

  if (name === undefined) {
    return undefined;
  }

  const kind = await chooseKind(options, deps);

  if (kind === undefined) {
    return undefined;
  }

  const transport = kind === "http" ? await buildHttp(options, deps) : await buildStdio(options, deps);

  return transport ? { name, transport } : undefined;
}

async function chooseAgents(
  options: McpInstallOptions,
  deps: McpInstallDeps,
  results: ScanResult[],
  found: ScanResult[],
): Promise<Agent[] | undefined> {
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

  return targets.map(({ agent }) => agent);
}

async function isConfirmed(
  options: McpInstallOptions,
  deps: McpInstallDeps,
  server: McpServer,
  agents: Agent[],
): Promise<boolean> {
  if (options.yes) {
    return true;
  }

  assertCanPrompt(deps, "pass --yes to confirm");

  return deps.prompts.confirm(
    server,
    agents.map(({ name }) => name),
  );
}

function countAgents(count: number): string {
  return `${count} ${count === 1 ? "agent" : "agents"}`;
}

function oneLine(text: string): string {
  return text.replaceAll("\n", " ");
}

function formatOutcome(outcome: McpOutcome, colors: ChalkInstance): { mark: string; text: string } {
  switch (outcome.status) {
    case "confirmed":
      return {
        mark: colors.green("✔"),
        text: outcome.note ? `added and confirmed. Listed as: ${oneLine(outcome.note)}` : "added and confirmed",
      };
    case "unconfirmed":
      return { mark: colors.yellow("!"), text: `added, but could not confirm: ${oneLine(outcome.detail)}` };
    case "failed":
      return { mark: colors.red("✖"), text: `failed: ${oneLine(outcome.detail)}` };
    case "skipped":
      return { mark: colors.red("✖"), text: `skipped: ${oneLine(outcome.detail)}` };
  }
}

export function formatMcpOutcomes(outcomes: McpOutcome[], colors: ChalkInstance): string[] {
  const nameWidth = Math.max(...outcomes.map(({ agent }) => agent.name.length));

  return outcomes.map((outcome) => {
    const { mark, text } = formatOutcome(outcome, colors);

    return `${mark} ${outcome.agent.name.padEnd(nameWidth)}  ${text}`;
  });
}

async function installWithProgress(
  server: McpServer,
  agents: Agent[],
  { install, progress }: McpInstallDeps,
): Promise<McpOutcome[]> {
  progress.start(`Installing ${server.name}...`);

  try {
    return await install(server, agents, (agent) =>
      progress.update(`Installing ${server.name} into ${agent.name}...`),
    );
  } catch (error) {
    progress.fail(`Could not install ${server.name}`);

    throw error;
  }
}

function isProblem({ status }: McpOutcome): boolean {
  return status === "failed" || status === "skipped";
}

export async function runMcpInstall(options: McpInstallOptions, deps: McpInstallDeps): Promise<void> {
  const { progress, print, colors = chalk } = deps;
  const results = deps.scan();
  const found = results.filter((result) => result.found);

  if (found.length === 0) {
    throw new SelectionError("no agents were found on this computer");
  }

  const server = await chooseServer(options, deps);
  const agents = server ? await chooseAgents(options, deps, results, found) : undefined;

  if (!server || !agents || !(await isConfirmed(options, deps, server, agents))) {
    print(CANCELLED_MESSAGE);

    return;
  }

  const outcomes = await installWithProgress(server, agents, deps);
  const problems = outcomes.filter(isProblem);

  if (problems.length === 0) {
    progress.succeed(`Installed ${server.name} into ${countAgents(outcomes.length)}`);
  } else {
    progress.fail(
      `Could not install ${server.name} into ${problems.length} of ${countAgents(outcomes.length)}`,
    );
  }

  for (const line of formatMcpOutcomes(outcomes, colors)) {
    print(line);
  }

  if (problems.length > 0) {
    throw new InstallError(
      `${server.name} was not installed into ${problems.map(({ agent }) => agent.name).join(", ")}`,
    );
  }
}
