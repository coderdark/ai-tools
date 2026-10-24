import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENTS, type AgentId } from "./agents/registry.ts";
import type { ScanResult } from "./agents/scan.ts";
import { resolveTargets, SelectionError } from "./selection.ts";

/** Scan results where only the listed agents were found. */
function scanWith(found: AgentId[]): ScanResult[] {
  return AGENTS.map((agent) => ({
    agent,
    found: found.includes(agent.id),
    skillsDir: `/home/.${agent.id}/skills`,
  }));
}

function ids(targets: ReturnType<typeof resolveTargets>): string[] | undefined {
  return targets?.map((target) => target.agent.id);
}

test("resolveTargets returns undefined when no flag was given, so the caller must ask", () => {
  const results = scanWith(["cursor", "claude"]);

  assert.equal(resolveTargets(results, {}), undefined);
  assert.equal(resolveTargets(results, { agents: [] }), undefined);
});

test("resolveTargets with all returns every found agent and skips the missing ones", () => {
  const results = scanWith(["cursor", "claude", "chatgpt"]);
  const targets = resolveTargets(results, { all: true });

  assert.deepEqual(ids(targets), ["cursor", "claude", "chatgpt"]);
  assert.equal(targets?.[0]?.skillsDir, "/home/.cursor/skills");
});

test("resolveTargets with named agents returns just those, in the order given, once each", () => {
  const results = scanWith(["cursor", "claude", "chatgpt"]);

  assert.deepEqual(
    ids(resolveTargets(results, { agents: ["chatgpt", "cursor", "chatgpt"] })),
    ["chatgpt", "cursor"],
  );
});

function rejectsWith(message: RegExp): (error: unknown) => boolean {
  return (error) => error instanceof SelectionError && message.test(error.message);
}

test("resolveTargets rejects --agent together with --all", () => {
  const results = scanWith(["cursor"]);

  assert.throws(
    () => resolveTargets(results, { all: true, agents: ["cursor"] }),
    rejectsWith(/--agent and --all cannot be used together/),
  );
});

test("resolveTargets rejects an unknown agent and lists the valid ids", () => {
  const results = scanWith(["cursor"]);

  assert.throws(
    () => resolveTargets(results, { agents: ["bard"] }),
    rejectsWith(/unknown agent "bard".*cursor, claude, chatgpt, gemini, grok/s),
  );
});

test("resolveTargets rejects a named agent that the scan did not find", () => {
  const results = scanWith(["cursor"]);

  assert.throws(
    () => resolveTargets(results, { agents: ["cursor", "gemini"] }),
    rejectsWith(/Gemini is not installed on this computer/),
  );
});

test("resolveTargets rejects --all when the scan found no agents", () => {
  assert.throws(
    () => resolveTargets(scanWith([]), { all: true }),
    rejectsWith(/no agents were found/),
  );
});
