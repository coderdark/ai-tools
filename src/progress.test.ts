import { test } from "node:test";
import assert from "node:assert/strict";
import { createProgress, type Spinner } from "./progress.ts";

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
