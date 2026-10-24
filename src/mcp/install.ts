import { join } from "node:path";
import type { Agent } from "../agents/registry.ts";
import {
  commandProblem,
  errorMessage,
  findPresence,
  readCheck,
  summarizeOutput,
  type McpCheckDeps,
  type Presence,
} from "./check.ts";
import { addToJsonConfig } from "./json-config.ts";
import type { McpServer } from "./server.ts";
import {
  MCP_SETUPS,
  type ExistingPlace,
  type McpCheck,
  type McpCliSetup,
  type McpJsonFileSetup,
  type McpSetup,
} from "./setups.ts";

export interface McpInstallDeps extends McpCheckDeps {
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

/** Shorter values are mostly flags such as 1 or true, and hiding them would garble every message. */
const MIN_SECRET_LENGTH = 4;

function secretsOf({ transport }: McpServer): string[] {
  const values = Object.values(transport.kind === "http" ? transport.headers : transport.env);

  return values.filter((value) => value.length >= MIN_SECRET_LENGTH);
}

function present<T extends object>(fields: T): T {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value)) as T;
}

function whereAdded(setup: McpSetup, { home, env }: McpInstallDeps): Placed {
  return present({ savedIn: setup.savedIn?.(home, env), scopeNote: setup.scopeNote });
}

function alreadyInstalled(setup: McpSetup, place: ExistingPlace): McpResult & Placed {
  return {
    status: "already-installed",
    ...present({ note: place.note, savedIn: place.savedIn, scopeNote: setup.scopeNote }),
  };
}

function settledBy(presence: Presence, setup: McpSetup): (McpResult & Placed) | undefined {
  switch (presence.state) {
    case "present":
      return alreadyInstalled(setup, presence.place);
    case "unknown":
      return { status: "skipped", detail: presence.reason };
    case "absent":
      return undefined;
  }
}

/**
 * A result that settles the agent before anything is added: already installed, or it cannot be done.
 * Some agents quietly replace a server that has the same name, so the tool asks first and never replaces.
 */
async function checkBeforeAdding(
  server: McpServer,
  agent: Agent,
  deps: McpInstallDeps,
): Promise<(McpResult & Placed) | undefined> {
  const setup = MCP_SETUPS[agent.id];
  const problem = commandProblem(setup, deps) ?? (setup.kind === "cli" ? setup.unsupported?.(server) : undefined);

  if (problem !== undefined) {
    return { status: "skipped", detail: problem };
  }

  return settledBy(await findPresence(server.name, setup, deps, secretsOf(server)), setup);
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
