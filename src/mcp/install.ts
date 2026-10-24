import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { Agent } from "../agents/registry.ts";
import { addToJsonConfig, checkJsonConfig } from "./json-config.ts";
import type { CommandResult, CommandRunner } from "./run-command.ts";
import type { McpServer } from "./server.ts";
import { MCP_SETUPS, type McpCheck, type McpCliSetup, type McpJsonFileSetup, type McpSetup } from "./setups.ts";

export interface McpInstallDeps {
  home: string;
  env: NodeJS.ProcessEnv;
  isOnPath(name: string): boolean;
  runCommand: CommandRunner;
  onProgress?(agent: Agent): void;
}

export type McpResult =
  | { status: "confirmed"; /** What the agent printed for the server, when it lists them. */ note?: string }
  /** The agent already has a server with this name. Only the name is compared, and nothing is changed. */
  | { status: "already-installed"; /** The agent's own words about where the server lives. */ note?: string }
  | { status: "unconfirmed" | "failed" | "skipped"; detail: string };

/** Set only when the server was added, or was already there and the agent says where. */
interface Placed {
  savedIn?: string;
  scopeNote?: string;
}

export type McpOutcome = { agent: Agent } & McpResult & Placed;

const MAX_DETAIL_LINES = 3;

/** Shorter values are mostly flags such as 1 or true, and hiding them would garble every message. */
const MIN_SECRET_LENGTH = 4;

function secretsOf({ transport }: McpServer): string[] {
  const values = Object.values(transport.kind === "http" ? transport.headers : transport.env);

  return values.filter((value) => value.length >= MIN_SECRET_LENGTH);
}

function redact(text: string, secrets: string[]): string {
  return secrets.reduce((safe, secret) => safe.replaceAll(secret, "***"), text);
}

function summarizeOutput({ exitCode, stdout, stderr }: CommandResult, secrets: string[]): string {
  const text = redact(stderr.trim() || stdout.trim(), secrets);

  if (!text) {
    return `exited with code ${exitCode}`;
  }

  return text.split("\n").slice(0, MAX_DETAIL_LINES).join("\n");
}

function errorMessage(error: unknown, secrets: string[]): string {
  return redact(error instanceof Error ? error.message : String(error), secrets);
}

/** The line of a listing that names the server, matched as a whole name. Terminal control codes are removed. */
function findListedLine(listing: string, name: string): string | undefined {
  const wholeName = new RegExp(`(?<![A-Za-z0-9_-])${name}(?![A-Za-z0-9_-])`);

  return stripVTControlCharacters(listing)
    .split("\n")
    .map((line) => line.trim())
    .find((line) => wholeName.test(line));
}

/** What a check command says about a server, or undefined when the agent does not know it. */
function readCheck(result: CommandResult, check: McpCheck, name: string): { note?: string } | undefined {
  if (result.exitCode !== 0) {
    return undefined;
  }

  if (!check.listsAllServers) {
    return {};
  }

  const note = findListedLine(result.stdout, name);

  return note === undefined ? undefined : { note };
}

function present<T extends object>(fields: T): T {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value)) as T;
}

function whereAdded(setup: McpSetup, { home, env }: McpInstallDeps): Placed {
  return present({ savedIn: setup.savedIn?.(home, env), scopeNote: setup.scopeNote });
}

function alreadyInstalled(setup: McpSetup, checkOutput: string, deps: McpInstallDeps): McpResult & Placed {
  const { home, env } = deps;
  const located = setup.locateExisting?.(checkOutput, home, env) ?? { savedIn: setup.savedIn?.(home, env) };

  return {
    status: "already-installed",
    ...present({ note: located.note, savedIn: located.savedIn, scopeNote: setup.scopeNote }),
  };
}

function skipped(detail: string | undefined): McpResult | undefined {
  return detail === undefined ? undefined : { status: "skipped", detail };
}

/** Some agents quietly replace a server that has the same name, so the tool asks first and never replaces. */
async function findExisting(
  server: McpServer,
  setup: McpCliSetup,
  deps: McpInstallDeps,
): Promise<(McpResult & Placed) | undefined> {
  const { check } = setup;

  try {
    const result = await deps.runCommand(check.command, check.args(server.name));

    return readCheck(result, check, server.name) ? alreadyInstalled(setup, result.stdout, deps) : undefined;
  } catch (error) {
    return skipped(errorMessage(error, secretsOf(server)));
  }
}

async function checkCursorFile(
  server: McpServer,
  setup: McpJsonFileSetup,
  deps: McpInstallDeps,
): Promise<(McpResult & Placed) | undefined> {
  const found = await checkJsonConfig(join(deps.home, ...setup.path), setup.key, server.name);

  if (found.state === "exists") {
    return alreadyInstalled(setup, "", deps);
  }

  return found.state === "unreadable" ? skipped(found.message) : undefined;
}

/** A result that settles the agent before anything is added: already installed, or it cannot be done. */
async function checkBeforeAdding(
  server: McpServer,
  agent: Agent,
  deps: McpInstallDeps,
): Promise<(McpResult & Placed) | undefined> {
  const setup = MCP_SETUPS[agent.id];

  if (setup.kind === "json-file") {
    return checkCursorFile(server, setup, deps);
  }

  if (!deps.isOnPath(setup.command)) {
    return skipped(`${setup.command} was not found on PATH`);
  }

  return skipped(setup.unsupported?.(server)) ?? findExisting(server, setup, deps);
}

function addToCursorFile(server: McpServer, setup: McpJsonFileSetup, deps: McpInstallDeps): Promise<void> {
  return addToJsonConfig(join(deps.home, ...setup.path), setup.key, server.name, setup.entry(server));
}

async function addWithCommand(server: McpServer, setup: McpCliSetup, deps: McpInstallDeps): Promise<string | undefined> {
  const result = await deps.runCommand(setup.command, setup.add(server));

  return result.exitCode === 0 ? undefined : summarizeOutput(result, secretsOf(server));
}

async function addServer(server: McpServer, agent: Agent, deps: McpInstallDeps): Promise<string | undefined> {
  const setup = MCP_SETUPS[agent.id];

  if (setup.kind === "json-file") {
    await addToCursorFile(server, setup, deps);

    return undefined;
  }

  return addWithCommand(server, setup, deps);
}

async function confirmServer(server: McpServer, check: McpCheck, deps: McpInstallDeps): Promise<McpResult> {
  if (!deps.isOnPath(check.command)) {
    return { status: "unconfirmed", detail: `could not check: ${check.command} was not found on PATH` };
  }

  const result = await deps.runCommand(check.command, check.args(server.name));
  const reading = readCheck(result, check, server.name);

  if (reading) {
    return { status: "confirmed", ...reading };
  }

  return {
    status: "unconfirmed",
    detail:
      result.exitCode === 0
        ? `${check.command} does not list ${server.name}`
        : summarizeOutput(result, secretsOf(server)),
  };
}

async function installOne(server: McpServer, agent: Agent, deps: McpInstallDeps): Promise<McpOutcome> {
  const secrets = secretsOf(server);

  try {
    const failure = await addServer(server, agent, deps);

    if (failure !== undefined) {
      return { agent, status: "failed", detail: failure };
    }

    const setup = MCP_SETUPS[agent.id];

    return { agent, ...(await confirmServer(server, setup.check, deps)), ...whereAdded(setup, deps) };
  } catch (error) {
    return { agent, status: "failed", detail: errorMessage(error, secrets) };
  }
}

/**
 * Checks every agent first, then adds the server to each one that passed.
 * An agent that was skipped or that failed does not stop the others.
 */
export async function installMcpServer(
  server: McpServer,
  agents: Agent[],
  deps: McpInstallDeps,
): Promise<McpOutcome[]> {
  const early = await Promise.all(agents.map((agent) => checkBeforeAdding(server, agent, deps)));
  const outcomes: McpOutcome[] = [];

  for (const [index, agent] of agents.entries()) {
    const settled = early[index];

    if (settled !== undefined) {
      outcomes.push({ agent, ...settled });

      continue;
    }

    deps.onProgress?.(agent);
    outcomes.push(await installOne(server, agent, deps));
  }

  return outcomes;
}
