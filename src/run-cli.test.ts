import { test } from "node:test";
import assert from "node:assert/strict";
import { Chalk } from "chalk";
import type { Command } from "commander";
import { UsageError } from "./install-command.ts";
import { buildProgram, type ProgramHandlers } from "./program.ts";
import { runCli } from "./run-cli.ts";
import { SelectionError } from "./selection.ts";
import { InstallError } from "./skills/install.ts";
import { SkillError } from "./skills/skill.ts";

const plain = new Chalk({ level: 0 });

function makeProgram(installError?: Error): Command {
  const handlers: ProgramHandlers = {
    install: async () => {
      if (installError) {
        throw installError;
      }
    },
    agents: async () => {},
    menu: async () => {},
  };

  return buildProgram(handlers).configureOutput({ writeOut: () => {}, writeErr: () => {} });
}

async function run(args: string[], installError?: Error) {
  const errors: string[] = [];
  const code = await runCli(makeProgram(installError), args, {
    error: (line) => errors.push(line),
    colors: plain,
  });

  return { code, errors };
}

test("runCli returns 0 when the command succeeds", async () => {
  assert.deepEqual(await run(["install"]), { code: 0, errors: [] });
});

const knownErrors = [
  new SkillError("SKILL.md is missing"),
  new SelectionError("Gemini is not installed on this computer"),
  new InstallError("Claude: /tmp/x already exists"),
  new UsageError("pass --yes to confirm when not running in a terminal"),
];

for (const error of knownErrors) {
  test(`runCli prints ${error.constructor.name} as a one-line error and returns 1`, async () => {
    assert.deepEqual(await run(["install"], error), {
      code: 1,
      errors: [`Error: ${error.message}`],
    });
  });
}

test("runCli exits quietly with 130 when the user presses Ctrl+C in a prompt", async () => {
  const cancelled = Object.assign(new Error("User force closed the prompt"), {
    name: "ExitPromptError",
  });

  assert.deepEqual(await run(["install"], cancelled), { code: 130, errors: [] });
});

test("runCli returns the exit code of a Commander error without printing it again", async () => {
  assert.deepEqual(await run(["no-such-command"]), { code: 1, errors: [] });
});

test("runCli prints the stack of an unexpected error and returns 1", async () => {
  const { code, errors } = await run(["install"], new TypeError("boom"));

  assert.equal(code, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", /^Unexpected error: TypeError: boom/);
});
