import { test } from "node:test";
import assert from "node:assert/strict";
import { UsageError } from "./install-command.ts";
import { runMenu, type MenuDeps, type MenuEntry } from "./menu.ts";
import { SelectionError } from "./selection.ts";

const LEAVE = "leave";

interface Log {
  events: string[];
}

/**
 * Dependencies that answer from `script` in order: an entry name picks that entry in the
 * menu being shown, and "leave" leaves it with Esc. Everything is recorded in the log.
 */
function makeDeps(
  script: string[],
  buildEntries: (log: Log) => MenuEntry[],
  overrides: Partial<MenuDeps> = {},
): { deps: MenuDeps; log: Log } {
  const log: Log = { events: [] };
  const remaining = [...script];

  const deps: MenuDeps = {
    title: "What would you like to do?",
    entries: buildEntries(log),
    choose: async ({ title, entries }) => {
      log.events.push(`menu: ${title} [${entries.map(({ name }) => name).join(", ")}]`);

      const next = remaining.shift();

      assert.ok(next, "the menu asked again after the script ran out");

      if (next === LEAVE) {
        return undefined;
      }

      const entry = entries.find(({ name }) => name === next);

      assert.ok(entry, `no entry named ${next} in the menu being shown`);

      return entry;
    },
    interactive: true,
    ...overrides,
  };

  return { deps, log };
}

function action(log: Log, name: string): MenuEntry {
  return {
    name,
    run: async () => {
      log.events.push(`run: ${name}`);
    },
  };
}

test("runMenu runs the chosen action once and then ends", async () => {
  const { deps, log } = makeDeps(["Agents"], (events) => [action(events, "Agents")]);

  await runMenu(deps);

  assert.deepEqual(log.events, ["menu: What would you like to do? [Agents]", "run: Agents"]);
});

test("runMenu ends without running anything when the user leaves the top menu", async () => {
  const { deps, log } = makeDeps([LEAVE], (events) => [action(events, "Agents")]);

  await runMenu(deps);

  assert.deepEqual(log.events, ["menu: What would you like to do? [Agents]"]);
});

test("runMenu opens a group and runs the chosen action once", async () => {
  const { deps, log } = makeDeps(["Skills", "List"], (events) => [
    { name: "Skills", entries: [action(events, "List"), action(events, "Install")] },
    action(events, "Agents"),
  ]);

  await runMenu(deps);

  assert.deepEqual(log.events, [
    "menu: What would you like to do? [Skills, Agents]",
    "menu: Skills [List, Install]",
    "run: List",
  ]);
});

test("runMenu ends, without asking again, when the user leaves a group", async () => {
  const { deps, log } = makeDeps(["Skills", LEAVE], (events) => [
    { name: "Skills", entries: [action(events, "List")] },
    action(events, "Agents"),
  ]);

  await runMenu(deps);

  assert.deepEqual(log.events, [
    "menu: What would you like to do? [Skills, Agents]",
    "menu: Skills [List]",
  ]);
});

test("runMenu supports groups inside groups", async () => {
  const { deps, log } = makeDeps(["Outer", "Inner", "Deep"], (events) => [
    { name: "Outer", entries: [{ name: "Inner", entries: [action(events, "Deep")] }] },
  ]);

  await runMenu(deps);

  assert.deepEqual(log.events, [
    "menu: What would you like to do? [Outer]",
    "menu: Outer [Inner]",
    "menu: Inner [Deep]",
    "run: Deep",
  ]);
});

test("runMenu passes on an error from an action, including a user error", async () => {
  const { deps } = makeDeps(["Skills", "Install"], () => [
    {
      name: "Skills",
      entries: [
        {
          name: "Install",
          run: async () => {
            throw new SelectionError("no agents were found on this computer");
          },
        },
      ],
    },
  ]);

  await assert.rejects(
    runMenu(deps),
    (error: unknown) =>
      error instanceof SelectionError && /no agents were found on this computer/.test(error.message),
  );
});

test("runMenu stops when the user cancels a prompt with Ctrl+C", async () => {
  const cancelled = Object.assign(new Error("User force closed the prompt"), {
    name: "ExitPromptError",
  });
  const { deps, log } = makeDeps([], () => [], {
    choose: async () => {
      throw cancelled;
    },
  });

  await assert.rejects(runMenu(deps), (error: unknown) => error === cancelled);
  assert.deepEqual(log.events, []);
});

test("runMenu refuses to start without a terminal", async () => {
  const { deps, log } = makeDeps([LEAVE], (events) => [action(events, "Agents")], {
    interactive: false,
  });

  await assert.rejects(
    runMenu(deps),
    (error: unknown) => error instanceof UsageError && /menu needs a terminal/.test(error.message),
  );
  assert.deepEqual(log.events, []);
});
