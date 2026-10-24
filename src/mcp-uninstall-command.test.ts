import { test } from "node:test";
import assert from "node:assert/strict";
import { Chalk } from "chalk";
import { AGENTS, type Agent, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { UsageError } from "./install-command.ts";
import {
  formatMcpRemovals,
  runMcpUninstall,
  type McpUninstallDeps,
  type McpUninstallPrompts,
} from "./mcp-uninstall-command.ts";
import type { Presence } from "./mcp/check.ts";
import type { McpFound, McpRemovalOutcome } from "./mcp/uninstall.ts";
import { SelectionError } from "./selection.ts";
import { InstallError } from "./skills/install.ts";

const CANCELLED = "Cancelled. Nothing was removed.";
const plain = new Chalk({ level: 0 });
const HAS: Presence = { state: "present", place: { savedIn: "/p/file" } };
const LACKS: Presence = { state: "absent" };

function agentOf(id: AgentId): Agent {
  const agent = AGENTS.find((candidate) => candidate.id === id);

  assert.ok(agent, id);

  return agent;
}

interface Log {
  prompts: string[];
  progress: string[];
  output: string[];
  checked: AgentId[][];
  removed: AgentId[][];
  asked: { name: string; candidates: AgentId[] }[];
  confirmed: { name: string; agents: string[] }[];
}

function outcomeFor({ agent, presence }: McpFound): McpRemovalOutcome {
  if (presence.state === "unknown") {
    return { agent, status: "skipped", detail: presence.reason };
  }

  if (presence.state === "absent") {
    return { agent, status: "not-installed" };
  }

  return { agent, status: "removed", ...(presence.place.savedIn && { savedIn: presence.place.savedIn }) };
}

function makeDeps(
  found: AgentId[],
  presences: Partial<Record<AgentId, Presence>>,
  answers: Partial<McpUninstallPrompts> = {},
  overrides: Partial<McpUninstallDeps> = {},
): { deps: McpUninstallDeps; log: Log } {
  const log: Log = { prompts: [], progress: [], output: [], checked: [], removed: [], asked: [], confirmed: [] };
  const results: ScanResult[] = AGENTS.map((agent) => ({
    agent,
    found: found.includes(agent.id),
    skillsDir: "/unused",
  }));
  const unexpected = (name: string) => async (): Promise<never> => {
    log.prompts.push(name);
    throw new Error(`unexpected prompt: ${name}`);
  };
  const prompts: McpUninstallPrompts = {
    name: unexpected("name"),
    agents: unexpected("agents"),
    confirm: unexpected("confirm"),
    ...answers,
  };
  const deps: McpUninstallDeps = {
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
    find: async (_name, agents) => {
      log.checked.push(agents.map(({ id }) => id));

      return agents.map((agent) => ({ agent, presence: presences[agent.id] ?? LACKS }));
    },
    uninstall: async (_name, entries, onProgress) => {
      log.removed.push(entries.map(({ agent }) => agent.id));

      for (const { agent, presence } of entries) {
        if (presence.state === "present") {
          onProgress(agent);
        }
      }

      return entries.map(outcomeFor);
    },
    ...overrides,
  };

  return { deps, log };
}

function recording(log: Log, answers: { name?: string; request?: { all?: boolean; agents?: string[] }; yes?: boolean }) {
  const prompts: Partial<McpUninstallPrompts> = {
    name: async () => answers.name,
    agents: async (name, candidates) => {
      log.asked.push({ name, candidates: candidates.map(({ agent }) => agent.id) });

      return answers.request;
    },
    confirm: async (name, agents) => {
      log.confirmed.push({ name, agents });

      return answers.yes ?? true;
    },
  };

  return prompts;
}

test("runMcpUninstall removes a server named by flags, from the agent named by flags, without asking anything", async () => {
  const { deps, log } = makeDeps(["cursor", "chatgpt"], { chatgpt: HAS });

  await runMcpUninstall({ name: "fs", agents: ["chatgpt"], yes: true }, deps);

  assert.deepEqual(log.checked, [["chatgpt"]]);
  assert.deepEqual(log.removed, [["chatgpt"]]);
  assert.deepEqual(log.prompts, []);
  assert.deepEqual(log.output, ["✔ ChatGPT  uninstalled from /p/file"]);
  assert.deepEqual(log.progress, [
    "start: Uninstalling fs...",
    "update: Uninstalling fs from ChatGPT...",
    "succeed: Uninstalled fs from 1 agent",
  ]);
});

test("runMcpUninstall asks for the name, offers only the agents that have the server, and confirms before removing", async () => {
  const { deps, log } = makeDeps(["cursor", "claude", "chatgpt"], { cursor: HAS, chatgpt: HAS });

  Object.assign(deps.prompts, recording(log, { name: "fs", request: { all: true } }));

  await runMcpUninstall({}, deps);

  assert.deepEqual(log.checked, [["cursor", "claude", "chatgpt"]]);
  assert.deepEqual(log.asked, [{ name: "fs", candidates: ["cursor", "chatgpt"] }]);
  assert.deepEqual(log.confirmed, [{ name: "fs", agents: ["Cursor", "ChatGPT"] }]);
  assert.deepEqual(log.removed, [["cursor", "chatgpt"]]);
});

test("runMcpUninstall removes only from the agents the user picked", async () => {
  const { deps, log } = makeDeps(["cursor", "chatgpt"], { cursor: HAS, chatgpt: HAS });

  Object.assign(deps.prompts, recording(log, { name: "fs", request: { agents: ["chatgpt"] } }));

  await runMcpUninstall({}, deps);

  assert.deepEqual(log.confirmed, [{ name: "fs", agents: ["ChatGPT"] }]);
  assert.deepEqual(log.removed, [["chatgpt"]]);
});

test("runMcpUninstall cancels without removing anything at each question", async () => {
  const atName = makeDeps(["cursor"], { cursor: HAS });
  const atAgents = makeDeps(["cursor"], { cursor: HAS });
  const atConfirm = makeDeps(["cursor"], { cursor: HAS });

  Object.assign(atName.deps.prompts, recording(atName.log, { name: undefined }));
  Object.assign(atAgents.deps.prompts, recording(atAgents.log, { name: "fs", request: undefined }));
  Object.assign(atConfirm.deps.prompts, recording(atConfirm.log, { name: "fs", request: { all: true }, yes: false }));

  for (const { deps, log } of [atName, atAgents, atConfirm]) {
    await runMcpUninstall({}, deps);

    assert.deepEqual(log.output, [CANCELLED]);
    assert.deepEqual(log.removed, []);
  }
});

test("runMcpUninstall says not installed, and is not an error, when no agent has the server", async () => {
  const { deps, log } = makeDeps(["cursor", "claude"], {});

  Object.assign(deps.prompts, recording(log, { name: "fs" }));

  await runMcpUninstall({}, deps);

  assert.deepEqual(log.asked, []);
  assert.deepEqual(log.confirmed, []);
  assert.deepEqual(log.output, ["✔ Cursor  not installed", "✔ Claude  not installed"]);
  assert.equal(log.progress.at(-1), "succeed: fs is not installed in 2 agents");
});

test("runMcpUninstall says not installed for a named agent that does not have the server, and does not ask to confirm", async () => {
  const { deps, log } = makeDeps(["cursor", "chatgpt"], { cursor: HAS });

  await runMcpUninstall({ name: "fs", agents: ["chatgpt"] }, deps);

  assert.deepEqual(log.output, ["✔ ChatGPT  not installed"]);
  assert.deepEqual(log.confirmed, []);
});

test("runMcpUninstall counts the agents it removed from and the ones that did not have the server", async () => {
  const { deps, log } = makeDeps(["cursor", "claude"], { cursor: HAS });

  await runMcpUninstall({ name: "fs", all: true, yes: true }, deps);

  assert.equal(log.progress.at(-1), "succeed: Uninstalled fs from 1 agent; 1 did not have it");
});

test("runMcpUninstall fails when an agent could not remove the server, and still prints every line", async () => {
  const { deps, log } = makeDeps(["cursor", "claude"], { cursor: HAS, claude: HAS }, {}, {
    uninstall: async (_name, entries) =>
      entries.map(({ agent }) =>
        agent.id === "claude"
          ? { agent, status: "failed" as const, detail: "boom\nsecond line" }
          : { agent, status: "removed" as const, savedIn: "/p/file" },
      ),
  });

  await assert.rejects(
    runMcpUninstall({ name: "fs", all: true, yes: true }, deps),
    (error) => error instanceof InstallError && error.message === "fs was not uninstalled from Claude",
  );
  assert.equal(log.progress.at(-1), "fail: Could not uninstall fs from 1 of 2 agents");
  assert.deepEqual(log.output, ["✔ Cursor  uninstalled from /p/file", "✖ Claude  failed: boom second line"]);
});

test("runMcpUninstall treats a skipped agent as a problem", async () => {
  const { deps } = makeDeps(["claude"], { claude: { state: "unknown", reason: "claude was not found on PATH" } });

  await assert.rejects(
    runMcpUninstall({ name: "fs", all: true, yes: true }, deps),
    (error) => error instanceof InstallError && error.message === "fs was not uninstalled from Claude",
  );
});

test("runMcpUninstall refuses to prompt when it is not running in a terminal", async () => {
  const noName = makeDeps(["cursor"], { cursor: HAS }, {}, { interactive: false });
  const noAgents = makeDeps(["cursor"], { cursor: HAS }, {}, { interactive: false });
  const noYes = makeDeps(["cursor"], { cursor: HAS }, {}, { interactive: false });

  await assert.rejects(
    runMcpUninstall({}, noName.deps),
    new UsageError("pass the server name as an argument when not running in a terminal"),
  );
  await assert.rejects(
    runMcpUninstall({ name: "fs" }, noAgents.deps),
    new UsageError("choose agents with --agent or --all when not running in a terminal"),
  );
  await assert.rejects(
    runMcpUninstall({ name: "fs", all: true }, noYes.deps),
    new UsageError("pass --yes to confirm when not running in a terminal"),
  );
});

test("runMcpUninstall rejects a bad name, an unknown agent, and a computer with no agents", async () => {
  const { deps } = makeDeps(["cursor"], {});

  await assert.rejects(runMcpUninstall({ name: "bad name" }, deps), UsageError);
  await assert.rejects(runMcpUninstall({ name: "fs", agents: ["nope"] }, deps), SelectionError);
  await assert.rejects(
    runMcpUninstall({ name: "fs", all: true }, makeDeps([], {}).deps),
    new SelectionError("no agents were found on this computer"),
  );
});

test("formatMcpRemovals shows the file, or says the agent did not have it, and colors the marks", () => {
  const colors = new Chalk({ level: 1 });

  assert.deepEqual(
    formatMcpRemovals(
      [
        { agent: agentOf("cursor"), status: "removed" },
        { agent: agentOf("chatgpt"), status: "skipped", detail: "no\nway" },
      ],
      plain,
    ),
    ["✔ Cursor   uninstalled", "✖ ChatGPT  skipped: no way"],
  );
  assert.equal(
    formatMcpRemovals([{ agent: agentOf("cursor"), status: "not-installed" }], colors)[0],
    `${colors.green("✔")} Cursor  not installed`,
  );
});
