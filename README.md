# ai-toolbox

A command-line tool that finds the AI agents on your computer and installs a skill into the ones you pick.

**For now, the tool does one thing: install a skill from a folder on your computer.** Plugins, MCP (Model Context Protocol) servers, deleting skills, project-level skills and downloading from git are not built yet. See [PLAN.md](PLAN.md) for the phases.

## Supported agents

The tool looks for each agent by its config folder in your home folder, a command on your `PATH`, or an app in `/Applications` or `~/Applications`. It only installs into agents it finds.

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

The package defines a command named `ai-toolbox`. The examples below use `node dist/cli.js`, which runs the same program.

## Use it

Run it with no command to get a menu:

```sh
node dist/cli.js
```

Show which agents were found:

```sh
node dist/cli.js agents
```

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

If the command isn't running in a terminal (for example in a script), it never asks questions. It stops with an error that says what you need to pass: the skill folder, `--agent` or `--all`, or `--yes`.

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
- Cursor also reads the Claude and ChatGPT folders. If Cursor is installed and you didn't choose it, installing into Claude or ChatGPT prints a note that Cursor will see the skill too.

## Output

Colors turn off when the output isn't a terminal, or when `NO_COLOR` is set. With `NO_COLOR` set, the spinner is replaced by plain lines. Press Ctrl+C at any question to quit. The tool exits with 0 on success, 1 on an error and 130 when you quit.

## Develop

```sh
npm test
npm run typecheck
```

Tests use Node's built-in test runner and sit next to the code they cover. Read [AGENTS.md](AGENTS.md) for the working rules and [PLAN.md](PLAN.md) for the design.
