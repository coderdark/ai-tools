import { join } from "node:path";
import type { Agent } from "../agents/registry.ts";
import {
  commandProblem,
  errorMessage,
  findPresence,
  summarizeOutput,
  type McpCheckDeps,
  type Presence,
} from "./check.ts";
import { removeFromJsonConfig } from "./json-config.ts";
import { MCP_SETUPS, type ExistingPlace, type McpJsonFileSetup, type McpSetup } from "./setups.ts";

export interface McpUninstallDeps extends McpCheckDeps {
  onProgress?(agent: Agent): void;
}

export interface McpFound {
  agent: Agent;
  presence: Presence;
}

export type McpRemoval =
  | { status: "removed"; savedIn?: string }
  | { status: "not-installed" }
  | { status: "failed" | "skipped"; detail: string };

export type McpRemovalOutcome = { agent: Agent } & McpRemoval;

/** Asks every agent whether it has a server with this name. Changes nothing. */
export function findMcpServer(name: string, agents: Agent[], deps: McpUninstallDeps): Promise<McpFound[]> {
  return Promise.all(
    agents.map(async (agent): Promise<McpFound> => {
      const setup = MCP_SETUPS[agent.id];
      const problem = commandProblem(setup, deps);

      return { agent, presence: problem ? { state: "unknown", reason: problem } : await findPresence(name, setup, deps) };
    }),
  );
}

function removeFromCursorFile(name: string, setup: McpJsonFileSetup, { home }: McpUninstallDeps): Promise<boolean> {
  return removeFromJsonConfig(join(home, ...setup.path), setup.key, name);
}

/** The reason the removal failed, or undefined when it went through. */
async function removeServer(name: string, setup: McpSetup, deps: McpUninstallDeps): Promise<string | undefined> {
  if (setup.kind === "json-file") {
    await removeFromCursorFile(name, setup, deps);

    return undefined;
  }

  const result = await deps.runCommand(setup.command, setup.remove(name));

  return result.exitCode === 0 ? undefined : summarizeOutput(result, []);
}

async function removeOne(name: string, agent: Agent, place: ExistingPlace, deps: McpUninstallDeps): Promise<McpRemovalOutcome> {
  const setup = MCP_SETUPS[agent.id];

  try {
    const failure = await removeServer(name, setup, deps);

    if (failure !== undefined) {
      return { agent, status: "failed", detail: failure };
    }

    if ((await findPresence(name, setup, deps)).state === "present") {
      return { agent, status: "failed", detail: `${agent.name} still has a server named ${name} after the remove command ran` };
    }

    return { agent, status: "removed", ...(place.savedIn && { savedIn: place.savedIn }) };
  } catch (error) {
    return { agent, status: "failed", detail: errorMessage(error, []) };
  }
}

async function settle(name: string, { agent, presence }: McpFound, deps: McpUninstallDeps): Promise<McpRemovalOutcome> {
  switch (presence.state) {
    case "absent":
      return { agent, status: "not-installed" };
    case "unknown":
      return { agent, status: "skipped", detail: presence.reason };
    case "present":
      break;
  }

  const { place } = presence;

  if (place.note && !place.savedIn) {
    return {
      agent,
      status: "skipped",
      detail: `${agent.name} has it in: ${place.note}. Only the user-level server is removed.`,
    };
  }

  deps.onProgress?.(agent);

  return removeOne(name, agent, place, deps);
}

/**
 * Removes the server from each agent that has it, using the agent's own remove command
 * (or Cursor's file), then asks again to make sure it is gone.
 * An agent that was skipped or that failed does not stop the others.
 */
export async function uninstallMcpServer(
  name: string,
  found: McpFound[],
  deps: McpUninstallDeps,
): Promise<McpRemovalOutcome[]> {
  const outcomes: McpRemovalOutcome[] = [];

  for (const entry of found) {
    outcomes.push(await settle(name, entry, deps));
  }

  return outcomes;
}
