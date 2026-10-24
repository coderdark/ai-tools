import chalk, { type ChalkInstance } from "chalk";
import { UsageError } from "./install-command.ts";
import { formatUserError, isUserError } from "./user-error.ts";

export interface MenuAction {
  name: string;
  run(): Promise<void>;
}

export interface MenuGroup {
  name: string;
  entries: MenuEntry[];
}

export type MenuEntry = MenuAction | MenuGroup;

export interface MenuRequest {
  title: string;
  entries: MenuEntry[];
  leaveLabel: string;
  /** True in a group, where Esc can leave. The top level has no Back, so Esc does nothing there. */
  canGoBack: boolean;
}

export interface MenuDeps {
  title: string;
  entries: MenuEntry[];
  /** Resolves to the chosen entry, or undefined when the user picked Exit or Back. */
  choose(request: MenuRequest): Promise<MenuEntry | undefined>;
  interactive: boolean;
  print(line: string): void;
  printError(line: string): void;
  colors?: ChalkInstance;
}

function isGroup(entry: MenuEntry): entry is MenuGroup {
  return "entries" in entry;
}

async function runAction(action: MenuAction, { printError, colors = chalk }: MenuDeps): Promise<void> {
  try {
    await action.run();
  } catch (error) {
    if (!isUserError(error)) {
      throw error;
    }

    printError(formatUserError(error, colors));
  }
}

async function runLevel(
  title: string,
  entries: MenuEntry[],
  canGoBack: boolean,
  deps: MenuDeps,
): Promise<void> {
  const request = { title, entries, canGoBack, leaveLabel: canGoBack ? "Back" : "Exit" };

  for (let entry = await deps.choose(request); entry; entry = await deps.choose(request)) {
    if (isGroup(entry)) {
      await runLevel(entry.name, entry.entries, true, deps);

      continue;
    }

    await runAction(entry, deps);
    deps.print("");
  }
}

export async function runMenu(deps: MenuDeps): Promise<void> {
  if (!deps.interactive) {
    throw new UsageError("the menu needs a terminal. Run a command instead, such as `skills`");
  }

  await runLevel(deps.title, deps.entries, false, deps);
}
