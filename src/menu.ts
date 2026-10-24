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
}

export interface MenuDeps {
  title: string;
  entries: MenuEntry[];
  /** Resolves to the chosen entry, or undefined when the user left the menu with Esc. */
  choose(request: MenuRequest): Promise<MenuEntry | undefined>;
  interactive: boolean;
}

function isGroup(entry: MenuEntry): entry is MenuGroup {
  return "entries" in entry;
}

async function runLevel(title: string, entries: MenuEntry[], deps: MenuDeps): Promise<void> {
  const entry = await deps.choose({ title, entries });

  if (!entry) {
    return;
  }

  if (isGroup(entry)) {
    await runLevel(entry.name, entry.entries, deps);

    return;
  }

  await entry.run();
}

export async function runMenu(deps: MenuDeps): Promise<void> {
  if (!deps.interactive) {
    throw new UsageError("the menu needs a terminal. Run a command instead, such as `skills`");
  }

  await runLevel(deps.title, deps.entries, deps);
}
