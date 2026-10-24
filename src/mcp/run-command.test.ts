import { test } from "node:test";
import assert from "node:assert/strict";
import { McpCommandError, runCommand } from "./run-command.ts";

test("runCommand returns the output of a command that succeeds", async () => {
  const result = await runCommand(process.execPath, ["-e", "console.log('hello')"]);

  assert.deepEqual(result, { exitCode: 0, stdout: "hello\n", stderr: "" });
});

test("runCommand returns the exit code and the error output of a command that fails", async () => {
  const result = await runCommand(process.execPath, ["-e", "console.error('bad'); process.exit(3)"]);

  assert.deepEqual(result, { exitCode: 3, stdout: "", stderr: "bad\n" });
});

test("runCommand passes each argument as it is, with no shell in between", async () => {
  const result = await runCommand(process.execPath, [
    "-e",
    "console.log(JSON.stringify(process.argv.slice(1)))",
    "a b",
    "$HOME;ls",
    "*",
  ]);

  assert.equal(result.stdout.trim(), JSON.stringify(["a b", "$HOME;ls", "*"]));
});

test("runCommand rejects, without showing the arguments, when the command does not exist", async () => {
  await assert.rejects(runCommand("ai-toolbox-no-such-command", ["--token=secret"]), (error) => {
    assert.ok(error instanceof McpCommandError);
    assert.equal(error.message, "ai-toolbox-no-such-command was not found");

    return true;
  });
});

test("runCommand rejects, without showing the arguments, when the command takes too long", async () => {
  await assert.rejects(
    runCommand(process.execPath, ["-e", "setTimeout(() => {}, 5000)", "--", "--token=secret"], 100),
    (error) => {
      assert.ok(error instanceof McpCommandError);
      assert.match(error.message, /did not finish/);
      assert.doesNotMatch(error.message, /secret/);

      return true;
    },
  );
});
