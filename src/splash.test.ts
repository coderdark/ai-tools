import { test } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { Chalk } from "chalk";
import { formatSplash } from "./splash.ts";

const plain = new Chalk({ level: 0 });
const INFO = {
  name: "ai-tools",
  version: "0.1.0",
  description: "Scan this computer for AI agents, then manage their skills and MCP servers.",
};

test("formatSplash draws a box with the name and version, then the description wrapped inside it", () => {
  assert.deepEqual(formatSplash(INFO, plain, 80), [
    "╭──────────────────────────────────────────────────────────╮",
    "│ ai-tools v0.1.0                                          │",
    "│                                                          │",
    "│ Scan this computer for AI agents, then manage their      │",
    "│ skills and MCP servers.                                  │",
    "╰──────────────────────────────────────────────────────────╯",
    "",
  ]);
});

test("formatSplash treats a terminal that reports no width like an 80-column one", () => {
  assert.deepEqual(formatSplash(INFO, plain, 0), formatSplash(INFO, plain, 80));
  assert.deepEqual(formatSplash(INFO, plain, undefined), formatSplash(INFO, plain, 80));
});

test("formatSplash keeps every line inside a narrow terminal", () => {
  for (const columns of [40, 30]) {
    const widest = Math.max(...formatSplash(INFO, plain, columns).map((line) => stripVTControlCharacters(line).length));

    assert.ok(widest <= columns, `${widest} is wider than ${columns} columns`);
  }
});

test("formatSplash colors the name bold magenta and the version yellow when colors are on", () => {
  const colors = new Chalk({ level: 1 });
  const text = formatSplash(INFO, colors, 80).join("\n");

  assert.ok(text.includes(colors.bold.magenta("ai-tools")), "the name is not bold magenta");
  assert.ok(text.includes(colors.yellow("v0.1.0")), "the version is not yellow");
});

test("formatSplash uses no color codes when colors are off, and colors the name and border when they are on", () => {
  const colors = new Chalk({ level: 1 });
  const off = formatSplash(INFO, plain, 80).join("\n");
  const on = formatSplash(INFO, colors, 80).join("\n");

  assert.doesNotMatch(off, /\u001b\[/);
  assert.match(on, /\u001b\[/);
  assert.equal(stripVTControlCharacters(on), off);
});
