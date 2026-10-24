import { test } from "node:test";
import assert from "node:assert/strict";
import { Chalk } from "chalk";
import { AGENTS, type Agent, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { UsageError } from "./install-command.ts";
import {
  formatMcpOutcomes,
  runMcpInstall,
  type McpInstallDeps,
  type McpInstallPrompts,
} from "./mcp-install-command.ts";
import type { McpOutcome } from "./mcp/install.ts";
import type { McpServer } from "./mcp/server.ts";
import { SelectionError } from "./selection.ts";
import { InstallError } from "./skills/install.ts";

const CANCELLED = "Cancelled. Nothing was installed.";
const plain = new Chalk({ level: 0 });

function agentOf(id: AgentId): Agent {
  const agent = AGENTS.find((candidate) => candidate.id === id);

  assert.ok(agent, id);

  return agent;
}

interface Log {
  prompts: string[];
  progress: string[];
  output: string[];
  installs: { server: McpServer; agents: AgentId[] }[];
}

function confirmedFor(agents: Agent[]): McpOutcome[] {
  return agents.map((agent) => ({ agent, status: "confirmed" }));
}

function makeDeps(
  found: AgentId[],
  answers: Partial<McpInstallPrompts> = {},
  overrides: Partial<McpInstallDeps> = {},
): { deps: McpInstallDeps; log: Log } {
  const log: Log = { prompts: [], progress: [], output: [], installs: [] };
  const results: ScanResult[] = AGENTS.map((agent) => ({
    agent,
    found: found.includes(agent.id),
    skillsDir: "/unused",
  }));
  const unexpected = (name: string) => async (): Promise<never> => {
    log.prompts.push(name);
    throw new Error(`unexpected prompt: ${name}`);
  };
  const prompts: McpInstallPrompts = {
    name: unexpected("name"),
    transport: unexpected("transport"),
    commandLine: unexpected("commandLine"),
    url: unexpected("url"),
    envEntry: unexpected("envEntry"),
    headerEntry: unexpected("headerEntry"),
    agents: unexpected("agents"),
    confirm: unexpected("confirm"),
    ...answers,
  };
  const deps: McpInstallDeps = {
    scan: () => results,
    prompts,
    interactive: true,
    colors: plain,
    print: (line) => log.output.push(line),
    progress: {
      start: (text) => log.progress.push(`start: ${text}`),
      update: (text) => log.progress.push(`update: ${text}`),
      succeed: (text) => log.progress.push(`succeed: ${text}`),
      fail: (text) => log.progress.push(`fail: ${text}`),
    },
    install: async (server, agents, onProgress) => {
      log.installs.push({ server, agents: agents.map(({ id }) => id) });

      for (const agent of agents) {
        onProgress(agent);
      }

      return confirmedFor(agents);
    },
    ...overrides,
  };

  return { deps, log };
}

function queue(values: (string | undefined)[]): () => Promise<string | undefined> {
  const rest = [...values];

  return async () => rest.shift();
}

test("runMcpInstall installs a remote server from flags without asking anything", async () => {
  const { deps, log } = makeDeps(["cursor", "claude", "gemini"]);

  await runMcpInstall(
    { name: "api", url: "https://mcp.example.com/mcp", headers: ["Authorization: Bearer abc1"], all: true, yes: true },
    deps,
  );

  assert.deepEqual(log.installs, [
    {
      server: {
        name: "api",
        transport: { kind: "http", url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer abc1" } },
      },
      agents: ["cursor", "claude", "gemini"],
    },
  ]);
  assert.deepEqual(log.prompts, []);
});

test("runMcpInstall installs a local server from flags: the first word is the command, the rest are arguments", async () => {
  const { deps, log } = makeDeps(["claude", "cursor"]);

  await runMcpInstall(
    { name: "fs", command: ["npx", "-y", "pkg", "/data"], env: ["API_KEY=abc1", "A=b=c"], agents: ["claude"], yes: true },
    deps,
  );

  assert.deepEqual(log.installs, [
    {
      server: {
        name: "fs",
        transport: { kind: "stdio", command: "npx", args: ["-y", "pkg", "/data"], env: { API_KEY: "abc1", A: "b=c" } },
      },
      agents: ["claude"],
    },
  ]);
});

test("runMcpInstall asks for a local server step by step, then the agents and a confirmation", async () => {
  const { deps, log } = makeDeps(["claude", "gemini"], {
    name: async () => "fs",
    transport: async () => "stdio",
    commandLine: async () => 'npx -y pkg "my folder"',
    envEntry: queue(["API_KEY=abc1", "DEBUG=1", ""]),
    agents: async () => ({ agents: ["gemini"] }),
    confirm: async (server, names) => {
      log.prompts.push(`confirm ${server.name} -> ${names.join(", ")}`);

      return true;
    },
  });

  await runMcpInstall({}, deps);

  assert.deepEqual(log.installs, [
    {
      server: {
        name: "fs",
        transport: {
          kind: "stdio",
          command: "npx",
          args: ["-y", "pkg", "my folder"],
          env: { API_KEY: "abc1", DEBUG: "1" },
        },
      },
      agents: ["gemini"],
    },
  ]);
  assert.deepEqual(log.prompts, ["confirm fs -> Gemini"]);
});

test("runMcpInstall asks for a remote server step by step, including its headers", async () => {
  const { deps, log } = makeDeps(["claude"], {
    name: async () => "api",
    transport: async () => "http",
    url: async () => "https://mcp.example.com/mcp",
    headerEntry: queue(["X-Id: 7", ""]),
    agents: async () => ({ all: true }),
    confirm: async () => true,
  });

  await runMcpInstall({}, deps);

  assert.deepEqual(log.installs[0]?.server, {
    name: "api",
    transport: { kind: "http", url: "https://mcp.example.com/mcp", headers: { "X-Id": "7" } },
  });
});

test("runMcpInstall adds the variables asked for to the ones given with --env", async () => {
  const { deps, log } = makeDeps(["claude"], {
    transport: async () => "stdio",
    commandLine: async () => "node server.js",
    envEntry: queue(["B=2", ""]),
    agents: async () => ({ all: true }),
    confirm: async () => true,
  });

  await runMcpInstall({ name: "fs", env: ["A=1"] }, deps);

  assert.deepEqual(log.installs[0]?.server.transport, {
    kind: "stdio",
    command: "node",
    args: ["server.js"],
    env: { A: "1", B: "2" },
  });
});

const CANCEL_POINTS: [string, Partial<McpInstallPrompts>][] = [
  ["the name", { name: async () => undefined }],
  ["the kind of server", { name: async () => "fs", transport: async () => undefined }],
  [
    "the command line",
    { name: async () => "fs", transport: async () => "stdio", commandLine: async () => undefined },
  ],
  [
    "the address",
    { name: async () => "api", transport: async () => "http", url: async () => undefined },
  ],
  [
    "a variable, after others were entered",
    {
      name: async () => "fs",
      transport: async () => "stdio",
      commandLine: async () => "node x.js",
      envEntry: queue(["A=1", undefined]),
    },
  ],
  [
    "a header",
    {
      name: async () => "api",
      transport: async () => "http",
      url: async () => "https://mcp.example.com",
      headerEntry: queue([undefined]),
    },
  ],
  [
    "the agents",
    {
      name: async () => "fs",
      transport: async () => "stdio",
      commandLine: async () => "node x.js",
      envEntry: async () => "",
      agents: async () => undefined,
    },
  ],
  [
    "the confirmation",
    {
      name: async () => "fs",
      transport: async () => "stdio",
      commandLine: async () => "node x.js",
      envEntry: async () => "",
      agents: async () => ({ all: true }),
      confirm: async () => false,
    },
  ],
];

for (const [point, answers] of CANCEL_POINTS) {
  test(`runMcpInstall installs nothing and says so when the user cancels at ${point}`, async () => {
    const { deps, log } = makeDeps(["claude"], answers);

    await runMcpInstall({}, deps);

    assert.deepEqual(log.output, [CANCELLED]);
    assert.deepEqual(log.installs, []);
    assert.deepEqual(log.progress, []);
  });
}

test("runMcpInstall fails before asking anything when no agent is found", async () => {
  const { deps, log } = makeDeps([]);

  await assert.rejects(runMcpInstall({}, deps), SelectionError);
  assert.deepEqual(log.prompts, []);
});

test("runMcpInstall never targets an agent that was not found", async () => {
  const { deps, log } = makeDeps(["claude"]);

  await assert.rejects(
    runMcpInstall({ name: "fs", command: ["node"], agents: ["gemini"], yes: true }, deps),
    (error) => error instanceof SelectionError && /Gemini is not installed/.test(error.message),
  );
  await assert.rejects(
    runMcpInstall({ name: "fs", command: ["node"], agents: ["claude"], all: true, yes: true }, deps),
    SelectionError,
  );
  assert.deepEqual(log.installs, []);
});

test("runMcpInstall does not ask questions without a terminal, and names what to pass instead", async () => {
  const cases: [Parameters<typeof runMcpInstall>[0], RegExp][] = [
    [{}, /server name/],
    [{ name: "fs" }, /--url or a command/],
    [{ name: "fs", command: ["node"] }, /--agent or --all/],
    [{ name: "fs", command: ["node"], all: true }, /--yes/],
  ];

  for (const [options, message] of cases) {
    const { deps, log } = makeDeps(["claude"]);

    await assert.rejects(
      runMcpInstall(options, { ...deps, interactive: false }),
      (error) => error instanceof UsageError && message.test(error.message),
      JSON.stringify(options),
    );
    assert.deepEqual(log.prompts, []);
    assert.deepEqual(log.installs, []);
  }
});

test("runMcpInstall rejects flag values that are not valid, without repeating a value that may be a secret", async () => {
  const cases: [Parameters<typeof runMcpInstall>[0], RegExp][] = [
    [{ name: "bad name", command: ["node"] }, /letters, numbers, hyphens and underscores/],
    [{ name: "fs", url: "ftp://x.example" }, /http:\/\/ or https:\/\//],
    [{ name: "fs", command: ["node"], env: ["nokeyvalue-s3cret"] }, /--env.*KEY=value/],
    [{ name: "fs", url: "https://x.example", headers: ["nocolon-s3cret"] }, /--header.*Name: value/],
    [{ name: "fs", url: "https://x.example", command: ["node"] }, /either --url or a command/],
    [{ name: "fs", url: "https://x.example", env: ["A=1"] }, /--env only works with a command/],
    [{ name: "fs", command: ["node"], headers: ["A: b"] }, /--header only works with --url/],
  ];

  for (const [options, message] of cases) {
    const { deps } = makeDeps(["claude"]);

    await assert.rejects(
      runMcpInstall({ all: true, yes: true, ...options }, deps),
      (error) => {
        assert.ok(error instanceof UsageError);
        assert.match(error.message, message);
        assert.doesNotMatch(error.message, /s3cret/);

        return true;
      },
      JSON.stringify(options),
    );
  }
});

test("runMcpInstall shows the progress of each agent and then the result of each", async () => {
  const { deps, log } = makeDeps(["claude", "cursor"]);

  await runMcpInstall({ name: "fs", command: ["node"], all: true, yes: true }, deps);

  assert.deepEqual(log.progress, [
    "start: Installing fs...",
    "update: Installing fs into Cursor...",
    "update: Installing fs into Claude...",
    "succeed: Installed fs into 2 agents",
  ]);
  assert.deepEqual(log.output, ["✔ Cursor  added and confirmed", "✔ Claude  added and confirmed"]);
});

test("runMcpInstall says \"1 agent\" for a single agent", async () => {
  const { deps, log } = makeDeps(["claude"]);

  await runMcpInstall({ name: "fs", command: ["node"], all: true, yes: true }, deps);

  assert.equal(log.progress.at(-1), "succeed: Installed fs into 1 agent");
});

test("runMcpInstall reports an agent that could not be confirmed without treating it as an error", async () => {
  const { deps, log } = makeDeps(["cursor"], {}, {
    install: async (_server, agents) => [
      { agent: agents[0] as Agent, status: "unconfirmed", detail: "could not check: agent was not found on PATH" },
    ],
  });

  await runMcpInstall({ name: "fs", command: ["node"], all: true, yes: true }, deps);

  assert.equal(log.progress.at(-1), "succeed: Installed fs into 1 agent");
  assert.deepEqual(log.output, ["! Cursor  added, but could not confirm: could not check: agent was not found on PATH"]);
});

test("runMcpInstall prints every result and then fails when an agent failed or was skipped", async () => {
  const { deps, log } = makeDeps(["cursor", "claude", "chatgpt"], {}, {
    install: async () => [
      { agent: agentOf("cursor"), status: "confirmed" },
      { agent: agentOf("claude"), status: "failed", detail: "boom\nsecond line" },
      { agent: agentOf("chatgpt"), status: "skipped", detail: "codex was not found on PATH" },
    ],
  });

  await assert.rejects(
    runMcpInstall({ name: "fs", command: ["node"], all: true, yes: true }, deps),
    (error) => {
      assert.ok(error instanceof InstallError);
      assert.equal(error.message, "fs was not installed into Claude, ChatGPT");

      return true;
    },
  );
  assert.equal(log.progress.at(-1), "fail: Could not install fs into 2 of 3 agents");
  assert.deepEqual(log.output, [
    "✔ Cursor   added and confirmed",
    "✖ Claude   failed: boom second line",
    "✖ ChatGPT  skipped: codex was not found on PATH",
  ]);
});

test("runMcpInstall marks the spinner as failed and passes the error on when the install itself breaks", async () => {
  const { deps, log } = makeDeps(["claude"], {}, {
    install: async () => {
      throw new Error("disk exploded");
    },
  });

  await assert.rejects(runMcpInstall({ name: "fs", command: ["node"], all: true, yes: true }, deps), /disk exploded/);
  assert.equal(log.progress.at(-1), "fail: Could not install fs");
  assert.deepEqual(log.output, []);
});

test("formatMcpOutcomes shows what the agent says about a server it has not loaded yet", () => {
  const [line] = formatMcpOutcomes(
    [{ agent: agentOf("cursor"), status: "confirmed", note: "fs: not loaded (needs approval)" }],
    plain,
  );

  assert.equal(line, "✔ Cursor  added and confirmed. Listed as: fs: not loaded (needs approval)");
});

test("formatMcpOutcomes colors the marks and pads the agent names", () => {
  const colors = new Chalk({ level: 1 });
  const lines = formatMcpOutcomes(
    [
      { agent: agentOf("cursor"), status: "confirmed" },
      { agent: agentOf("chatgpt"), status: "failed", detail: "x" },
    ],
    colors,
  );

  assert.equal(lines[0], `${colors.green("✔")} Cursor   added and confirmed`);
  assert.equal(lines[1], `${colors.red("✖")} ChatGPT  failed: x`);
});
