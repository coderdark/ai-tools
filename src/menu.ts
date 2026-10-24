import { UsageError } from "./install-command.ts";

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
  /** True for the first menu. Leaving it ends the tool; leaving a group goes back to the menu above. */
  isTopLevel: boolean;
}

export interface MenuDeps {
  title: string;
  entries: MenuEntry[];
  /** Resolves to the chosen entry, or undefined when the user left the menu (Esc, or Back in a group). */
  choose(request: MenuRequest): Promise<MenuEntry | undefined>;
  interactive: boolean;
}

function isGroup(entry: MenuEntry): entry is MenuGroup {
  return "entries" in entry;
}

/** Resolves to true when an action ran, and to false when the user left this level without choosing one. */
async function runLevel(
  title: string,
  entries: MenuEntry[],
  isTopLevel: boolean,
  deps: MenuDeps,
): Promise<boolean> {
  const request = { title, entries, isTopLevel };

  while (true) {
    const entry = await deps.choose(request);

    if (!entry) {
      return false;
    }

    if (!isGroup(entry)) {
      await entry.run();

      return true;
    }

    if (await runLevel(entry.name, entry.entries, false, deps)) {
      return true;
    }
  }
}

export async function runMenu(deps: MenuDeps): Promise<void> {
  if (!deps.interactive) {
    throw new UsageError("the menu needs a terminal. Run a command instead, such as `skills`");
  }

  await runLevel(deps.title, deps.entries, true, deps);
}
