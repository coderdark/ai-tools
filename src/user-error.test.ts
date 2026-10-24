import { test } from "node:test";
import assert from "node:assert/strict";
import { Chalk } from "chalk";
import { UsageError } from "./install-command.ts";
import { SelectionError } from "./selection.ts";
import { InstallError } from "./skills/install.ts";
import { SkillError } from "./skills/skill.ts";
import { formatUserError, isUserError } from "./user-error.ts";

test("isUserError is true for the errors that tell the user what to fix", () => {
  for (const error of [
    new SkillError("x"),
    new SelectionError("x"),
    new InstallError("x"),
    new UsageError("x"),
  ]) {
    assert.equal(isUserError(error), true, error.constructor.name);
  }
});

test("isUserError is false for unexpected errors and non-errors", () => {
  assert.equal(isUserError(new Error("boom")), false);
  assert.equal(isUserError("boom"), false);
  assert.equal(isUserError(undefined), false);
});

test("formatUserError prefixes the message with Error: and colors it red", () => {
  const colored = new Chalk({ level: 1 });

  assert.equal(formatUserError(new SkillError("bad name"), colored), colored.red("Error: bad name"));
  assert.equal(formatUserError(new SkillError("bad name"), new Chalk({ level: 0 })), "Error: bad name");
});
