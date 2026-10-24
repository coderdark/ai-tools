# ai-tools

A command-line tool that finds the AI agents on your computer, installs a skill or an MCP (Model Context Protocol) server into the ones you pick, and removes a skill again.

**For now, the tool does four things: install a skill from a folder on your computer, remove an installed skill, list the skills that are installed, and install an MCP server.** Plugins, listing or removing MCP servers, project-level skills and downloading from git are not built yet. See [PLAN.md](PLAN.md) for the phases.

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

Run it with no command to get a menu. It has three entries: **Agents** (list), **Skills** (list, install and uninstall) and **MCP servers** (install). The menu runs one action and then the tool exits, the same as the matching command. Press Esc in any menu, or Ctrl+C, to leave without doing anything. There is no way back to the top menu from the Skills menu: run the tool again to choose something else:

```sh
node dist/cli.js
```

In the menu, **List skills** opens a list you move through with the arrow keys. The line under the highlighted skill shows which agents have it and the date and time it was installed. Press Enter on a skill to see each agent's date, time and folder; the tool then exits. Press Esc to leave without choosing.

In the menu, **Agents** opens a list of only the agents that were found, each with how many skills it has, such as `Claude   8 skills`. The line under the highlighted agent shows its skills folder. Press Enter on an agent to see the skills installed in it, each with its date; the tool then exits. Press Esc to leave without choosing.

Esc at the top menu leaves the tool, and its footer reads `esc exit`. Esc in the Skills and MCP servers menus and in the Agents, List skills and uninstall lists cancels, and their footers read `esc cancel`. Esc also cancels each question of **Install a skill** and **Install an MCP server**. In every case the tool then ends.

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

## Install an MCP server

An MCP server gives an agent extra tools. This adds one server to the user-level settings of the agents you pick, so it is available in all your projects. Project-level settings are not touched.

```sh
node dist/cli.js mcp install
```

The tool asks, in order: a name, whether it is a local command or a remote address, the command line (such as `npx -y @modelcontextprotocol/server-filesystem /path`) or the address, any environment variables (for a command) or headers (for an address), one at a time until you enter nothing, which agents, and a confirmation. Press Esc at any question to cancel; nothing is written.

Install without any questions. Write the command after `--`:

```sh
node dist/cli.js mcp install files --all --yes --env API_KEY=abc123 -- npx -y @modelcontextprotocol/server-filesystem /path
node dist/cli.js mcp install docs --agent claude --agent cursor --yes --url https://mcp.example.com/mcp --header "X-Api-Key: abc123"
```

| Flag                     | What it does                                                     |
| ------------------------ | ---------------------------------------------------------------- |
| `--url <address>`        | A remote server at this address, instead of a command.           |
| `--env <KEY=value>`      | A variable for a local command. Repeat it for several.           |
| `--header "Name: value"` | A header for a remote server. Repeat it for several.             |
| `--agent <id>`, `--all`, `--yes` | The same as for skills.                                  |

The name uses letters, numbers, hyphens and underscores, up to 64 characters. Without a terminal the command never asks questions: it stops with an error that names what to pass.

How each agent is set up. The tool does not guess where an agent keeps its settings. It runs the agent's own `mcp add` command, so the agent writes its own file in its own format. Cursor has no such command, so the tool adds the entry to `~/.cursor/mcp.json`, keeping everything else in that file.

| Agent   | How the server is added                       | How it was checked                                     |
| ------- | --------------------------------------------- | ------------------------------------------------------ |
| Cursor  | the tool edits `~/.cursor/mcp.json`           | docs, a real file and a real run                       |
| Claude  | `claude mcp add --scope user`                 | docs, `--help` and a real run                          |
| ChatGPT | `codex mcp add`                               | docs, `--help` and a real run                          |
| Gemini  | `gemini mcp add --scope user`                 | **docs only. Not tested, because Gemini is not installed here.** |
| Grok    | `grok mcp add --scope user`                   | **docs only. Not tested, because Grok is not installed here.**   |

After adding, the tool asks the agent whether it now knows the server, using the agent's own command (`claude mcp get`, `codex mcp get`, `agent mcp list` for Cursor, `gemini mcp list`, `grok mcp list`). It prints one line per agent: added and confirmed, added but could not confirm, failed, or skipped. If any agent failed or was skipped, the tool exits with code 1. An agent whose command is not on your `PATH` is skipped.

Things to know:

- **A server with the same name is never replaced.** An agent that already has one is skipped. Codex would otherwise replace it without asking, which a real run showed.
- **Cursor may not run the server yet.** Cursor can list a new local server as `not loaded (needs approval)`. The tool shows that line and does not approve the server for you. Approve it in Cursor.
- **Codex cannot take custom headers** from its command line, so a remote server with headers is skipped for Codex. It only reads a bearer token from an environment variable.
- **Values are saved as typed.** Environment variables and headers go into each agent's settings file in plain text, and are passed to the agent's command, so other programs on your computer could see them while it runs. An environment variable or header you type stays visible on the screen. The tool never prints these values itself, and hides any value of four or more characters in the messages it shows. Shorter values, such as `1`, are left as they are so messages stay readable. Each agent expands references such as `${VAR}` with its own syntax, so check the agent's documentation before using one.
- **The command line has no shell.** Quotes group words, but pipes, redirects and `$VAR` are passed as plain text.

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
- MCP servers: an existing server is never replaced, a settings file the tool cannot read as JSON is left unchanged, and the tool writes it through a temporary file so a failure cannot leave half a file.
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
