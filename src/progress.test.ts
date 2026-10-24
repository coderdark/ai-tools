import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { createProgress, createSpinner, type Spinner } from "./progress.ts";

function makeTerminalStream(): { stream: NodeJS.WritableStream; output: () => string } {
  const chunks: string[] = [];
  const stream = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        chunks.push(String(chunk));
        done();
      },
    }),
    { isTTY: true, columns: 80, rows: 24, cursorTo: () => true, clearLine: () => true, moveCursor: () => true },
  );

  return { stream, output: () => chunks.join("") };
}

function makeFakeSpinner(): { spinner: Spinner; calls: string[] } {
  const calls: string[] = [];
  const spinner: Spinner = {
    start: (text) => calls.push(`start: ${text}`),
    succeed: (text) => calls.push(`succeed: ${text}`),
    fail: (text) => calls.push(`fail: ${text}`),
    set text(value: string) {
      calls.push(`text: ${value}`);
    },
    get text() {
      return "";
    },
  };

  return { spinner, calls };
}

test("createProgress maps start, update, succeed and fail onto the spinner", () => {
  const { spinner, calls } = makeFakeSpinner();
  const progress = createProgress(spinner);

  progress.start("Installing skill...");
  progress.update("Installing skill into Claude...");
  progress.succeed("Installed skill into 1 agent");
  progress.fail("Could not install skill");

  assert.deepEqual(calls, [
    "start: Installing skill...",
    "text: Installing skill into Claude...",
    "succeed: Installed skill into 1 agent",
    "fail: Could not install skill",
  ]);
});

function useInteractiveTerminalEnv(t: TestContext): void {
  const { TERM, CI } = process.env;

  process.env.TERM = "xterm-256color";
  delete process.env.CI;

  t.after(() => {
    process.env.TERM = TERM;

    if (CI !== undefined) {
      process.env.CI = CI;
    }
  });
}

test("createSpinner animates in a terminal when NO_COLOR is not set", (t) => {
  useInteractiveTerminalEnv(t);

  const { stream, output } = makeTerminalStream();
  const spinner = createSpinner({}, stream);

  spinner.start("working");
  spinner.succeed("done");

  assert.match(output(), /\x1b\[/);
});

test("createSpinner prints plain lines with no animation or color codes when NO_COLOR is set", (t) => {
  useInteractiveTerminalEnv(t);

  const { stream, output } = makeTerminalStream();
  const spinner = createSpinner({ NO_COLOR: "1" }, stream);

  spinner.start("working");
  spinner.succeed("done");

  assert.doesNotMatch(output(), /\x1b/);
  assert.match(output(), /working/);
  assert.match(output(), /done/);
});
