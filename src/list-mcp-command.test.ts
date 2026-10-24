import { test } from "node:test";
import assert from "node:assert/strict";
import { Chalk } from "chalk";
import { AGENTS, type Agent, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { formatMcpListings, runListMcp } from "./list-mcp-command.ts";
import type { AgentMcpListing } from "./mcp/list.ts";
import { SelectionError } from "./selection.ts";

const plain = new Chalk({ level: 0 });

function agentOf(id: AgentId): Agent {
  const agent = AGENTS.find((candidate) => candidate.id === id);

  assert.ok(agent, id);

  return agent;
}

function scanOf(found: AgentId[]): () => ScanResult[] {
  return () => AGENTS.map((agent) => ({ agent, found: found.includes(agent.id), skillsDir: "/unused" }));
}

test("formatMcpListings shows one block per agent: where its servers are, then each name with its kind", () => {
  const listings: AgentMcpListing[] = [
    {
      agent: agentOf("cursor"),
      status: "listed",
      savedIn: "/h/.cursor/mcp.json",
      servers: [
        { name: "alpha", kind: "local command" },
        { name: "zeta", kind: "remote address" },
      ],
    },
    {
      agent: agentOf("claude"),
      status: "listed",
      savedIn: "/h/.claude.json",
      note: "User-level servers only.",
      servers: [],
    },
    { agent: agentOf("gemini"), status: "not-listed", reason: "no way yet\nsecond line" },
  ];

  assert.deepEqual(formatMcpListings(listings, plain), [
    "Cursor  /h/.cursor/mcp.json",
    "  alpha  local command",
    "  zeta   remote address",
    "",
    "Claude  /h/.claude.json",
    "  User-level servers only.",
    "  no MCP servers",
    "",
    "Gemini",
    "  not listed: no way yet second line",
  ]);
});

test("formatMcpListings leaves out the path when an agent has none, and colors the headings", () => {
  const colors = new Chalk({ level: 1 });
  const [heading] = formatMcpListings(
    [{ agent: agentOf("chatgpt"), status: "listed", servers: [{ name: "a", kind: "other" }] }],
    colors,
  );

  assert.equal(heading, colors.bold("ChatGPT"));
});

test("runListMcp asks only the agents that were found, and prints what comes back", async () => {
  const printed: string[] = [];
  const asked: AgentId[][] = [];

  await runListMcp({
    scan: scanOf(["cursor", "chatgpt"]),
    list: async (agents) => {
      asked.push(agents.map(({ id }) => id));

      return agents.map((agent) => ({ agent, status: "listed" as const, servers: [] }));
    },
    print: (line) => printed.push(line),
    colors: plain,
  });

  assert.deepEqual(asked, [["cursor", "chatgpt"]]);
  assert.deepEqual(printed, ["Cursor", "  no MCP servers", "", "ChatGPT", "  no MCP servers"]);
});

test("runListMcp says so when no agent was found, and asks nothing", async () => {
  await assert.rejects(
    runListMcp({
      scan: scanOf([]),
      list: async () => assert.fail("nothing should be listed"),
      print: () => assert.fail("nothing should be printed"),
      colors: plain,
    }),
    new SelectionError("no agents were found on this computer"),
  );
});
