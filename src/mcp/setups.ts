import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { AGENTS, type AgentId } from "../agents/registry.ts";
import type { McpServer } from "./server.ts";

/** How to ask an agent whether it now knows the server. */
export interface McpCheck {
  command: string;
  args(name: string): string[];
  /** True when the command lists every server, so the name must appear in its output. */
  listsAllServers: boolean;
}

interface McpSetupFacts {
  /** The page this setup was taken from. */
  source: string;
  /** What was done to confirm it, so a reader can tell facts from documentation alone. */
  verified: string;
  check: McpCheck;
  /** The file the agent saves the server in. Left out until a real run has confirmed it. */
  savedIn?(home: string, env: NodeJS.ProcessEnv): string;
  /** Something the user should know about where the server will and will not show up. */
  scopeNote?: string;
  /** Where a server that is already there lives, read from what the check command printed. */
  locateExisting?(checkOutput: string, home: string, env: NodeJS.ProcessEnv): ExistingPlace;
}

/** `note` is the agent's own description of the place, for when there is no file to point to. */
export interface ExistingPlace {
  savedIn?: string;
  note?: string;
}

/** The agent writes its own config file when given its own `mcp add` command. */
export interface McpCliSetup extends McpSetupFacts {
  kind: "cli";
  command: string;
  add(server: McpServer): string[];
  /** A reason this agent cannot take the server, or undefined when it can. */
  unsupported?(server: McpServer): string | undefined;
}

/** The agent has no `mcp add` command, so the tool adds the entry to its JSON file. */
export interface McpJsonFileSetup extends McpSetupFacts {
  kind: "json-file";
  /** Relative to the home folder. */
  path: string[];
  /** The object in the file that holds the servers by name. */
  key: string;
  entry(server: McpServer): Record<string, unknown>;
}

export type McpSetup = McpCliSetup | McpJsonFileSetup;

function binaryOf(id: AgentId): string {
  const binary = AGENTS.find((agent) => agent.id === id)?.binaries[0];

  if (!binary) {
    throw new Error(`The ${id} agent has no command in the registry`);
  }

  return binary;
}

function flagsFor(flag: string, values: string[]): string[] {
  return values.flatMap((value) => [flag, value]);
}

function envFlags(flag: string, env: Record<string, string>): string[] {
  return flagsFor(
    flag,
    Object.entries(env).map(([key, value]) => `${key}=${value}`),
  );
}

function headerFlags(headers: Record<string, string>): string[] {
  return flagsFor(
    "--header",
    Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
  );
}

function withoutEmpty(entry: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(entry).filter(([, value]) => {
      const isEmptyList = Array.isArray(value) && value.length === 0;
      const isEmptyObject =
        typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;

      return !isEmptyList && !isEmptyObject;
    }),
  );
}

/** Gemini's docs put `--` just before the first argument that would be read as an option. */
function argsForGemini(args: string[]): string[] {
  const firstOption = args.findIndex((arg) => arg.startsWith("-"));

  if (firstOption === -1) {
    return args;
  }

  return [...args.slice(0, firstOption), "--", ...args.slice(firstOption)];
}

function claudeFile(home: string, env: NodeJS.ProcessEnv): string {
  return join(env.CLAUDE_CONFIG_DIR || home, ".claude.json");
}

const claude: McpCliSetup = {
  kind: "cli",
  command: binaryOf("claude"),
  source: "https://code.claude.com/docs/en/mcp",
  verified: "docs, `claude mcp add --help` and a real run",
  savedIn: claudeFile,
  locateExisting(output, home, env) {
    const scope = /^\s*Scope:\s*(.+)$/m.exec(stripVTControlCharacters(output))?.[1]?.trim();

    if (!scope) {
      return {};
    }

    return scope.startsWith("User config") ? { savedIn: claudeFile(home, env) } : { note: scope };
  },
  scopeNote: "Claude here means Claude Code. Its servers do not show on the Connectors screen of the Claude chat app.",
  check: { command: binaryOf("claude"), args: (name) => ["mcp", "get", name], listsAllServers: false },
  add({ name, transport }) {
    if (transport.kind === "http") {
      return [
        "mcp", "add", "--scope", "user", "--transport", "http", name, transport.url,
        ...headerFlags(transport.headers),
      ];
    }

    return [
      "mcp", "add", "--scope", "user", name, ...envFlags("-e", transport.env),
      "--", transport.command, ...transport.args,
    ];
  },
};

const chatgpt: McpCliSetup = {
  kind: "cli",
  command: binaryOf("chatgpt"),
  source: "https://developers.openai.com/codex/mcp",
  verified: "docs, `codex mcp add --help` and a real run",
  savedIn: (home, env) => join(env.CODEX_HOME || join(home, ".codex"), "config.toml"),
  check: {
    command: binaryOf("chatgpt"),
    args: (name) => ["mcp", "get", name, "--json"],
    listsAllServers: false,
  },
  unsupported({ transport }) {
    if (transport.kind === "http" && Object.keys(transport.headers).length > 0) {
      return "Codex cannot take custom headers on the command line. It only reads a bearer token from an environment variable.";
    }

    return undefined;
  },
  add({ name, transport }) {
    if (transport.kind === "http") {
      return ["mcp", "add", name, "--url", transport.url];
    }

    return ["mcp", "add", name, ...envFlags("--env", transport.env), "--", transport.command, ...transport.args];
  },
};

const gemini: McpCliSetup = {
  kind: "cli",
  command: binaryOf("gemini"),
  source: "https://geminicli.com/docs/tools/mcp-server/",
  verified: "docs only; Gemini is not installed on the machine this was written on",
  check: { command: binaryOf("gemini"), args: () => ["mcp", "list"], listsAllServers: true },
  add({ name, transport }) {
    if (transport.kind === "http") {
      return [
        "mcp", "add", "--scope", "user", "--transport", "http",
        ...headerFlags(transport.headers), name, transport.url,
      ];
    }

    return [
      "mcp", "add", "--scope", "user", ...envFlags("-e", transport.env),
      name, transport.command, ...argsForGemini(transport.args),
    ];
  },
};

const grok: McpCliSetup = {
  kind: "cli",
  command: binaryOf("grok"),
  source: "https://docs.x.ai/build/features/mcp-servers",
  verified: "docs only; Grok is not installed on the machine this was written on",
  check: { command: binaryOf("grok"), args: () => ["mcp", "list"], listsAllServers: true },
  add({ name, transport }) {
    if (transport.kind === "http") {
      return [
        "mcp", "add", "--scope", "user", "--transport", "http", name, transport.url,
        ...headerFlags(transport.headers),
      ];
    }

    return [
      "mcp", "add", "--scope", "user", name, ...envFlags("-e", transport.env),
      "--", transport.command, ...transport.args,
    ];
  },
};

const CURSOR_FILE = [".cursor", "mcp.json"];

const cursor: McpJsonFileSetup = {
  kind: "json-file",
  path: CURSOR_FILE,
  savedIn: (home) => join(home, ...CURSOR_FILE),
  key: "mcpServers",
  source: "https://cursor.com/docs/context/mcp",
  verified: "docs, a real ~/.cursor/mcp.json and a real run: `agent mcp list` listed the entry",
  check: { command: "agent", args: () => ["mcp", "list"], listsAllServers: true },
  entry({ transport }) {
    if (transport.kind === "http") {
      return withoutEmpty({ url: transport.url, headers: transport.headers });
    }

    return withoutEmpty({
      type: "stdio",
      command: transport.command,
      args: transport.args,
      env: transport.env,
    });
  },
};

export const MCP_SETUPS: Record<AgentId, McpSetup> = { cursor, claude, chatgpt, gemini, grok };
