import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { checkJsonConfig } from "./json-config.ts";
import type { CommandResult, CommandRunner } from "./run-command.ts";
import type { ExistingPlace, McpCheck, McpCliSetup, McpJsonFileSetup, McpSetup } from "./setups.ts";

export interface McpCheckDeps {
  home: string;
  env: NodeJS.ProcessEnv;
  isOnPath(name: string): boolean;
  runCommand: CommandRunner;
}

/** What an agent knows about a server name. `unknown` means the question could not be answered. */
export type Presence =
  | { state: "absent" }
  | { state: "present"; place: ExistingPlace }
  | { state: "unknown"; reason: string };

const MAX_DETAIL_LINES = 3;

export function redact(text: string, secrets: string[]): string {
  return secrets.reduce((safe, secret) => safe.replaceAll(secret, "***"), text);
}

export function summarizeOutput({ exitCode, stdout, stderr }: CommandResult, secrets: string[]): string {
  const text = redact(stderr.trim() || stdout.trim(), secrets);

  if (!text) {
    return `exited with code ${exitCode}`;
  }

  return text.split("\n").slice(0, MAX_DETAIL_LINES).join("\n");
}

export function errorMessage(error: unknown, secrets: string[]): string {
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
export function readCheck(result: CommandResult, check: McpCheck, name: string): { note?: string } | undefined {
  if (result.exitCode !== 0) {
    return undefined;
  }

  if (!check.listsAllServers) {
    return {};
  }

  const note = findListedLine(result.stdout, name);

  return note === undefined ? undefined : { note };
}

/** A reason the agent's command cannot be used, or undefined when it can. Cursor's file needs no command. */
export function commandProblem(setup: McpSetup, { isOnPath }: Pick<McpCheckDeps, "isOnPath">): string | undefined {
  if (setup.kind === "json-file" || isOnPath(setup.command)) {
    return undefined;
  }

  return `${setup.command} was not found on PATH`;
}

function placeOf(setup: McpSetup, checkOutput: string, { home, env }: McpCheckDeps): ExistingPlace {
  return setup.locateExisting?.(checkOutput, home, env) ?? { savedIn: setup.savedIn?.(home, env) };
}

async function findInFile(name: string, setup: McpJsonFileSetup, deps: McpCheckDeps): Promise<Presence> {
  const found = await checkJsonConfig(join(deps.home, ...setup.path), setup.key, name);

  switch (found.state) {
    case "exists":
      return { state: "present", place: placeOf(setup, "", deps) };
    case "unreadable":
      return { state: "unknown", reason: found.message };
    case "free":
      return { state: "absent" };
  }
}

async function findWithCommand(
  name: string,
  setup: McpCliSetup,
  deps: McpCheckDeps,
  secrets: string[],
): Promise<Presence> {
  const { check } = setup;

  try {
    const result = await deps.runCommand(check.command, check.args(name));

    return readCheck(result, check, name)
      ? { state: "present", place: placeOf(setup, result.stdout, deps) }
      : { state: "absent" };
  } catch (error) {
    return { state: "unknown", reason: errorMessage(error, secrets) };
  }
}

/**
 * Asks the agent whether it has a server with this name, the way the agent itself answers:
 * its own check command, or Cursor's file. The caller checks `commandProblem` first.
 */
export function findPresence(
  name: string,
  setup: McpSetup,
  deps: McpCheckDeps,
  secrets: string[] = [],
): Promise<Presence> {
  return setup.kind === "json-file" ? findInFile(name, setup, deps) : findWithCommand(name, setup, deps, secrets);
}
