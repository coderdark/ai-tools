import { test } from "node:test";
import assert from "node:assert/strict";
import { Chalk } from "chalk";
import { UsageError } from "./install-command.ts";
import { runMenu, type MenuDeps, type MenuEntry, type MenuRequest } from "./menu.ts";
import { SelectionError } from "./selection.ts";

const LEAVE = "leave";

interface Log {
  events: string[];
  output: string[];
  errors: string[];
}

/**
 * Dependencies that answer from `script` in order: an entry name picks that entry in the
 * menu being shown, and "leave" picks Exit or Back. Everything is recorded in the log.
 */
function makeDeps(
  script: string[],
  buildEntries: (log: Log) => MenuEntry[],
  overrides: Partial<MenuDeps> = {},
): { deps: MenuDeps; log: Log } {
  const log: Log = { events: [], output: [], errors: [] };
  const remaining = [...script];

  const deps: MenuDeps = {
    title: "What would you like to do?",
    entries: buildEntries(log),
    choose: async ({ title, entries, leaveLabel }) => {
      log.events.push(`menu: ${title} [${entries.map(({ name }) => name).join(", ")}] ${leaveLabel}`);

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
    print: (line) => log.output.push(line),
    printError: (line) => log.errors.push(line),
    colors: new Chalk({ level: 0 }),
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

test("runMenu runs a chosen action and shows the menu again until Exit", async () => {
  const { deps, log } = makeDeps(["Agents", "Agents", LEAVE], (events) => [action(events, "Agents")]);

  await runMenu(deps);

  assert.deepEqual(log.events, [
    "menu: What would you like to do? [Agents] Exit",
    "run: Agents",
    "menu: What would you like to do? [Agents] Exit",
    "run: Agents",
    "menu: What would you like to do? [Agents] Exit",
  ]);
});

test("runMenu opens a group, stays in it after an action, and returns on Back", async () => {
  const { deps, log } = makeDeps(["Skills", "List", "List", LEAVE, "Agents", LEAVE], (events) => [
    { name: "Skills", entries: [action(events, "List"), action(events, "Install")] },
    action(events, "Agents"),
  ]);

  await runMenu(deps);

  assert.deepEqual(log.events, [
    "menu: What would you like to do? [Skills, Agents] Exit",
    "menu: Skills [List, Install] Back",
    "run: List",
    "menu: Skills [List, Install] Back",
    "run: List",
    "menu: Skills [List, Install] Back",
    "menu: What would you like to do? [Skills, Agents] Exit",
    "run: Agents",
    "menu: What would you like to do? [Skills, Agents] Exit",
  ]);
});

test("runMenu supports groups inside groups", async () => {
  const { deps, log } = makeDeps(["Outer", "Inner", "Deep", LEAVE, LEAVE, LEAVE], (events) => [
    { name: "Outer", entries: [{ name: "Inner", entries: [action(events, "Deep")] }] },
  ]);

  await runMenu(deps);

  assert.deepEqual(
    log.events.filter((event) => event.startsWith("run")),
    ["run: Deep"],
  );
  assert.equal(log.events.at(-1), "menu: What would you like to do? [Outer] Exit");
});

test("runMenu prints a user error in red and stays at the same menu", async () => {
  const { deps, log } = makeDeps(["Skills", "Install", LEAVE, LEAVE], () => [
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

  await runMenu(deps);

  assert.deepEqual(log.errors, ["Error: no agents were found on this computer"]);
  assert.deepEqual(log.events.slice(-3), [
    "menu: Skills [Install] Back",
    "menu: Skills [Install] Back",
    "menu: What would you like to do? [Skills] Exit",
  ]);
});

test("runMenu stops on an unexpected error from an action", async () => {
  const { deps, log } = makeDeps(["Boom", LEAVE], () => [
    {
      name: "Boom",
      run: async () => {
        throw new Error("boom");
      },
    },
  ]);

  await assert.rejects(runMenu(deps), /boom/);
  assert.equal(log.events.length, 1);
  assert.deepEqual(log.errors, []);
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

test("runMenu prints a blank line after each action, but not when opening or leaving a group", async () => {
  const { deps, log } = makeDeps(["Skills", "List", LEAVE, LEAVE], () => [
    {
      name: "Skills",
      entries: [
        {
          name: "List",
          run: async () => {
            log.output.push("alpha  Claude");
          },
        },
      ],
    },
  ]);

  await runMenu(deps);

  assert.deepEqual(log.output, ["alpha  Claude", ""]);
});

test("runMenu tells the chooser that only a group can be left with Esc", async () => {
  const requests: MenuRequest[] = [];
  const { deps } = makeDeps(
    [],
    (log) => [{ name: "Skills", entries: [action(log, "List")] }],
    {
      choose: async (request) => {
        requests.push(request);

        return requests.length === 1 ? request.entries[0] : undefined;
      },
    },
  );

  await runMenu(deps);

  assert.deepEqual(
    requests.map(({ title, canGoBack }) => `${title}: ${canGoBack}`),
    ["What would you like to do?: false", "Skills: true", "What would you like to do?: false"],
  );
});
