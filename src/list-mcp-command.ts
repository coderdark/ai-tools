import chalk, { type ChalkInstance } from "chalk";
import type { Agent } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { findFoundAgents } from "./found-agents.ts";
import { oneLine } from "./mcp-install-command.ts";
import type { AgentMcpListing } from "./mcp/list.ts";

export interface ListMcpDeps {
  scan(): ScanResult[];
  list(agents: Agent[]): Promise<AgentMcpListing[]>;
  print(line: string): void;
  colors?: ChalkInstance;
}

function formatHeading(listing: AgentMcpListing, colors: ChalkInstance): string {
  const name = colors.bold(listing.agent.name);

  return listing.status === "listed" && listing.savedIn ? `${name}  ${colors.cyan(listing.savedIn)}` : name;
}

function formatBody(listing: AgentMcpListing, colors: ChalkInstance): string[] {
  if (listing.status === "not-listed") {
    return [`  ${colors.yellow(`not listed: ${oneLine(listing.reason)}`)}`];
  }

  const note = listing.note ? [`  ${colors.dim(listing.note)}`] : [];

  if (listing.servers.length === 0) {
    return [...note, `  ${colors.dim("no MCP servers")}`];
  }

  const nameWidth = Math.max(...listing.servers.map(({ name }) => name.length));

  return [
    ...note,
    ...listing.servers.map(({ name, kind }) => `  ${name.padEnd(nameWidth)}  ${colors.dim(kind)}`),
  ];
}

export function formatMcpListings(listings: AgentMcpListing[], colors: ChalkInstance = chalk): string[] {
  return listings.flatMap((listing, position) => [
    ...(position === 0 ? [] : [""]),
    formatHeading(listing, colors),
    ...formatBody(listing, colors),
  ]);
}

export async function runListMcp({ scan, list, print, colors = chalk }: ListMcpDeps): Promise<void> {
  const agents = findFoundAgents(scan).map(({ agent }) => agent);

  for (const line of formatMcpListings(await list(agents), colors)) {
    print(line);
  }
}
