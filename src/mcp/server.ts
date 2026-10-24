import { parseArgsStringToArgv } from "string-argv";

export type McpTransport =
  | { kind: "stdio"; command: string; args: string[]; env: Record<string, string> }
  | { kind: "http"; url: string; headers: Record<string, string> };

export interface McpServer {
  name: string;
  transport: McpTransport;
}

export class McpInputError extends Error {}

const NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ENV_ENTRY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const HEADER_ENTRY_PATTERN = /^([A-Za-z0-9-]+):\s*(\S.*)$/;

/** Stricter than any one agent needs, so one name is valid for all of them. */
export function checkServerName(name: string): true | string {
  return NAME_PATTERN.test(name)
    ? true
    : "Use letters, numbers, hyphens and underscores, up to 64 characters, such as my-server.";
}

export function checkUrl(url: string): true | string {
  const message = "Enter an address that starts with http:// or https://";

  try {
    const { protocol } = new URL(url);

    return protocol === "http:" || protocol === "https:" ? true : message;
  } catch {
    return message;
  }
}

export function checkEnvEntry(entry: string): true | string {
  return ENV_ENTRY_PATTERN.test(entry)
    ? true
    : "Enter it as KEY=value, with a name made of letters, numbers and underscores.";
}

export function checkHeaderEntry(entry: string): true | string {
  return HEADER_ENTRY_PATTERN.test(entry)
    ? true
    : "Enter it as Name: value, such as X-Api-Key: abc123.";
}

export function checkCommandLine(commandLine: string): true | string {
  return parseArgsStringToArgv(commandLine).length > 0 ? true : "Enter a command, such as npx -y my-mcp-server";
}

export function toEnv(entries: string[]): Record<string, string> {
  return Object.fromEntries(
    entries.map((entry) => {
      const separator = entry.indexOf("=");

      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
}

export function toHeaders(entries: string[]): Record<string, string> {
  return Object.fromEntries(
    entries.map((entry) => {
      const separator = entry.indexOf(":");

      return [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()];
    }),
  );
}

export function splitCommandLine(commandLine: string): string[] {
  const parts = parseArgsStringToArgv(commandLine);

  if (parts.length === 0) {
    throw new McpInputError("Enter a command, such as npx -y my-mcp-server");
  }

  return parts;
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** A one-line summary that names things but never shows a value that could be a secret. */
export function describeServer({ transport }: McpServer): string {
  if (transport.kind === "http") {
    const headerNames = Object.keys(transport.headers);
    const address = new URL(transport.url).origin;

    return headerNames.length > 0 ? `${address}, headers ${headerNames.join(", ")}` : address;
  }

  const variableNames = Object.keys(transport.env);
  const command =
    transport.args.length > 0
      ? `${transport.command} with ${pluralize(transport.args.length, "argument")}`
      : transport.command;

  return variableNames.length > 0 ? `${command}, variables ${variableNames.join(", ")}` : command;
}
