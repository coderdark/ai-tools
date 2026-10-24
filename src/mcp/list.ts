import { stripVTControlCharacters } from "node:util";
import type { Agent } from "../agents/registry.ts";
import { errorMessage, summarizeOutput, type McpCheckDeps } from "./check.ts";
import { listJsonConfig, McpConfigError } from "./json-config.ts";
import { MCP_SETUPS, type ListedServer, type McpListSource, type McpServerKind } from "./setups.ts";

export type McpListing =
  | { status: "listed"; servers: ListedServer[]; savedIn?: string; note?: string }
  | { status: "not-listed"; reason: string };

export type AgentMcpListing = { agent: Agent } & McpListing;

function kindOfEntry(entry: unknown): McpServerKind {
  const fields = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};

  if (typeof fields.url === "string") {
    return "remote address";
  }

  return typeof fields.command === "string" ? "local command" : "other";
}

/** Names come from files other programs write, so control codes must not reach the terminal. */
function printableName(name: string): string {
  return stripVTControlCharacters(name).replace(/[\u0000-\u001f\u007f-\u009f]/g, "?");
}

function sorted(servers: ListedServer[]): ListedServer[] {
  return servers
    .map(({ name, kind }) => ({ name: printableName(name), kind }))
    .sort((first, second) => first.name.localeCompare(second.name));
}

function notListed(reason: string): McpListing {
  return { status: "not-listed", reason };
}

async function listFromFile(
  source: Extract<McpListSource, { kind: "file" }>,
  { home, env }: McpCheckDeps,
): Promise<McpListing> {
  const path = source.path(home, env);

  try {
    const entries = await listJsonConfig(path, source.key);
    const servers = sorted(entries.map(({ name, entry }) => ({ name, kind: kindOfEntry(entry) })));

    return { status: "listed", servers, savedIn: path, ...(source.note && { note: source.note }) };
  } catch (error) {
    if (error instanceof McpConfigError) {
      return notListed(error.message);
    }

    throw error;
  }
}

async function runListCommand(source: Extract<McpListSource, { kind: "command" }>, deps: McpCheckDeps): Promise<McpListing> {
  const result = await deps.runCommand(source.command, source.args);

  if (result.exitCode !== 0) {
    return notListed(summarizeOutput(result, []));
  }

  try {
    return { status: "listed", servers: sorted(source.parse(result.stdout)) };
  } catch {
    return notListed(`could not read what ${source.command} printed`);
  }
}

async function listFromCommand(
  source: Extract<McpListSource, { kind: "command" }>,
  deps: McpCheckDeps,
): Promise<McpListing> {
  if (!deps.isOnPath(source.command)) {
    return notListed(`${source.command} was not found on PATH`);
  }

  try {
    return await runListCommand(source, deps);
  } catch (error) {
    return notListed(errorMessage(error, []));
  }
}

async function listOne(agent: Agent, deps: McpCheckDeps): Promise<McpListing> {
  const setup = MCP_SETUPS[agent.id];
  const { list } = setup;

  if (!list) {
    return notListed("how to list its servers has not been confirmed on a real machine");
  }

  const listing = list.kind === "file" ? await listFromFile(list, deps) : await listFromCommand(list, deps);

  if (listing.status === "listed" && list.kind === "command") {
    const savedIn = setup.savedIn?.(deps.home, deps.env);

    return savedIn ? { ...listing, savedIn } : listing;
  }

  return listing;
}

/**
 * Reads the servers each agent has, from its own file or its own listing command.
 * Nothing is started or contacted, and only names and kinds are read out.
 */
export function listMcpServers(agents: Agent[], deps: McpCheckDeps): Promise<AgentMcpListing[]> {
  return Promise.all(agents.map(async (agent) => ({ agent, ...(await listOne(agent, deps)) })));
}
