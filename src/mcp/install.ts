import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { Agent } from "../agents/registry.ts";
import { addToJsonConfig, checkJsonConfig } from "./json-config.ts";
import type { CommandResult, CommandRunner } from "./run-command.ts";
import type { McpServer } from "./server.ts";
import { MCP_SETUPS, type McpCheck, type McpCliSetup, type McpJsonFileSetup } from "./setups.ts";

export interface McpInstallDeps {
  home: string;
  isOnPath(name: string): boolean;
  runCommand: CommandRunner;
  onProgress?(agent: Agent): void;
}

export type McpResult =
  | { status: "confirmed"; /** What the agent printed for the server, when it lists them. */ note?: string }
  | { status: "unconfirmed" | "failed" | "skipped"; detail: string };

export type McpOutcome = { agent: Agent } & McpResult;

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

/** Some agents quietly replace a server that has the same name, so the tool asks first and never replaces. */
async function findExisting(server: McpServer, setup: McpCliSetup, deps: McpInstallDeps): Promise<string | undefined> {
  const { check } = setup;

  try {
    const result = await deps.runCommand(check.command, check.args(server.name));

    return readCheck(result, check, server.name)
      ? `${setup.command} already has a server named "${server.name}"`
      : undefined;
  } catch (error) {
    return errorMessage(error, secretsOf(server));
  }
}

async function findProblem(server: McpServer, agent: Agent, deps: McpInstallDeps): Promise<string | undefined> {
  const setup = MCP_SETUPS[agent.id];

  if (setup.kind === "json-file") {
    return checkJsonConfig(join(deps.home, ...setup.path), setup.key, server.name);
  }

  if (!deps.isOnPath(setup.command)) {
    return `${setup.command} was not found on PATH`;
  }

  return setup.unsupported?.(server) ?? findExisting(server, setup, deps);
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

    return { agent, ...(await confirmServer(server, MCP_SETUPS[agent.id].check, deps)) };
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
  const problems = await Promise.all(agents.map((agent) => findProblem(server, agent, deps)));
  const outcomes: McpOutcome[] = [];

  for (const [index, agent] of agents.entries()) {
    const problem = problems[index];

    if (problem !== undefined) {
      outcomes.push({ agent, status: "skipped", detail: problem });

      continue;
    }

    deps.onProgress?.(agent);
    outcomes.push(await installOne(server, agent, deps));
  }

  return outcomes;
}
