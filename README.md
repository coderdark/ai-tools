# ai-tools

A command-line tool that finds the AI agents on your computer and installs a skill into the ones you pick, and removes it again.

**For now, the tool does three things: install a skill from a folder on your computer, remove an installed skill, and list the skills that are installed.** Plugins, MCP (Model Context Protocol) servers, project-level skills and downloading from git are not built yet. See [PLAN.md](PLAN.md) for the phases.

## Supported agents

The tool looks for each agent by its config folder in your home folder, a command on your `PATH`, or an app in `/Applications` or `~/Applications`. It only installs into, or removes from, agents it finds.

| Agent   | Id        | Skills folder              |
| ------- | --------- | -------------------------- |
| Cursor  | `cursor`  | `~/.cursor/skills`         |
| Claude  | `claude`  | `~/.claude/skills`         |
| ChatGPT | `chatgpt` | `~/.codex/skills`          |
| Gemini  | `gemini`  | `~/.gemini/skills`         |
| Grok    | `grok`    | `~/.grok/skills`           |

`~/.agents/skills` is not used, because several agents read it and a copy there would not belong to one agent.

## Set up

You need Node 24.12 or newer.

```sh
npm install
npm run build
```

The package defines a command named `ai-tools`. The examples below use `node dist/cli.js`, which runs the same program.

## Use it

Run it with no command to get a menu. It has two entries: **Agents** (list) and **Skills** (list, install and uninstall). The menu runs one action and then the tool exits, the same as the matching command. Press Esc in any menu, or Ctrl+C, to leave without doing anything. There is no way back to the top menu from the Skills menu: run the tool again to choose something else:

```sh
node dist/cli.js
```

In the menu, **List skills** opens a list you move through with the arrow keys. The line under the highlighted skill shows which agents have it and the date and time it was installed. Press Enter on a skill to see each agent's date, time and folder; the tool then exits. Press Esc to leave without choosing.

In the menu, **Agents** opens a list of only the agents that were found, each with how many skills it has, such as `Claude   8 skills`. The line under the highlighted agent shows its skills folder. Press Enter on an agent to see the skills installed in it, each with its date; the tool then exits. Press Esc to leave without choosing.

Esc at the top menu leaves the tool, and its footer reads `esc exit`. Esc in the Skills menu and in the Agents, List skills and uninstall lists cancels, and their footers read `esc cancel`. Esc also cancels each question of **Install a skill**. In every case the tool then ends.

The tool does not record when it installs a skill, so the date and time are when the skill's folder was created in each agent's skills folder, in your local time as an ISO 8601 date and time with the offset from UTC, such as `2026-05-09T18:06-05:00` (24-hour clock, to the minute). For a skill added as a symlink it is the time of the link. If you copy or move a skill folder yourself, it is the time of the copy. On Linux some file systems do not keep creation times, so the value may be wrong there (not tested). The uninstall list and the Agents screen show the same dates and times.

The menu needs a terminal. In a script it stops with an error, so use a command such as `skills` there. If an action fails, for example because a skill already exists, the error shows in red and the tool exits with code 1, the same as a command.

List the agents that were found. The command prints every agent, found or missing, as plain text for scripts. The menu's **Agents** shows only the found ones:

```sh
node dist/cli.js agents
```

List the skills installed in those agents, with the agents that have each one:

```sh
node dist/cli.js skills
```

```text
alpha      Claude
review-pr  Cursor, Claude
```

This list is the same one the remove command shows, including skills you added by hand. The command only prints, so it works in a script. The menu's **List skills** is the one you can move through. If no agents are found it stops with an error. If no skills are installed it says so.

Install a skill. Anything you leave out, the tool asks for:

```sh
node dist/cli.js install ./my-skill
```

Install without any questions:

```sh
node dist/cli.js install ./my-skill --agent claude --agent chatgpt --yes
node dist/cli.js install ./my-skill --all --yes
```

| Flag             | What it does                                           |
| ---------------- | ------------------------------------------------------ |
| `--agent <id>`   | Install into this agent. Repeat it for several agents. |
| `--all`          | Install into every agent that was found.               |
| `--yes`          | Skip the confirmation question.                        |
| `--force`        | Replace a copy of the skill that is already installed. |

Use the ids from the table above with `--agent`. You can't use `--agent` and `--all` together.

Press Esc at any question to cancel. The tool prints "Cancelled. Nothing was installed." and exits with 0. Each question ends with a footer that includes `esc cancel`, like the lists. The confirmation is a Yes/No list.

If the command isn't running in a terminal (for example in a script), it never asks questions. It stops with an error that says what you need to pass: the skill folder, `--agent` or `--all`, or `--yes`.

## Remove a skill

```sh
node dist/cli.js uninstall
```

The tool asks three questions:

1. Which skill to remove. The list shows every skill found in your agents' skills folders, including ones you added by hand.
2. Which agents to remove it from. Only agents that have the skill are listed, and all are ticked.
3. Whether you are sure. The default answer is No.

There are no flags yet, so this command needs a terminal. In a script it stops with an error and removes nothing.

## What counts as a skill

A skill is a folder with a `SKILL.md` file at the top. `SKILL.md` starts with a short header:

```md
---
name: review-pr
description: Reviews pull requests.
---
```

- `description` is required.
- `name` is optional. Without it, the folder name is used. It must be 1 to 64 characters: lowercase letters, numbers and hyphens.

The whole folder is copied, except any `.git` folder. The original is not moved or changed.

## Safety

- Nothing is overwritten unless you pass `--force`, and `--force` replaces only the copy of this skill in each agent you chose. Your other skills are not touched.
- If a copy fails part-way, the tool deletes the copies it created earlier in the same run. A copy that `--force` already replaced is not restored.
- The tool refuses to install a skill onto itself.
- A removed skill can't be recovered, because the tool has no trash or backup. It only removes a folder that has a `SKILL.md`, and it checks every chosen agent before it removes from any.
- Cursor also reads the Claude and ChatGPT folders. If Cursor is installed and you didn't choose it, installing into Claude or ChatGPT prints a note that Cursor will see the skill too. Removing a skill from Claude or ChatGPT also removes it for Cursor, and the tool does not print a note about that.

## Output

Colors turn off when the output isn't a terminal, or when `NO_COLOR` is set. With `NO_COLOR` set, the spinner is replaced by plain lines. Press Ctrl+C at any question to quit. The tool exits with 0 on success or when you leave with Esc, 1 on an error and 130 when you quit with Ctrl+C.

## Develop

```sh
npm test
npm run typecheck
```

Tests use Node's built-in test runner and sit next to the code they cover. Read [AGENTS.md](AGENTS.md) for the working rules and [PLAN.md](PLAN.md) for the design.
