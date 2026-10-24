import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { runUntilEscape } from "./escape.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });

  return { promise, resolve, reject };
}

function rejectsWhenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("prompt aborted")));
  });
}

test("runUntilEscape returns the answer and stops listening for keys", async () => {
  const keys = new EventEmitter();

  const answer = await runUntilEscape(async () => "beta", keys);

  assert.equal(answer, "beta");
  assert.equal(keys.listenerCount("keypress"), 0);
});

test("runUntilEscape cancels the prompt and returns undefined when Esc is pressed", async () => {
  const keys = new EventEmitter();
  let signalSeen: AbortSignal | undefined;

  const result = runUntilEscape((signal) => {
    signalSeen = signal;

    return rejectsWhenAborted(signal);
  }, keys);

  keys.emit("keypress", undefined, { name: "escape" });

  assert.equal(await result, undefined);
  assert.equal(signalSeen?.aborted, true);
  assert.equal(keys.listenerCount("keypress"), 0);
});

test("runUntilEscape ignores keys other than Esc", async () => {
  const keys = new EventEmitter();
  const prompt = deferred<string>();
  let signalSeen: AbortSignal | undefined;

  const result = runUntilEscape((signal) => {
    signalSeen = signal;

    return prompt.promise;
  }, keys);

  keys.emit("keypress", "x", { name: "x" });
  keys.emit("keypress", undefined, undefined);
  prompt.resolve("alpha");

  assert.equal(await result, "alpha");
  assert.equal(signalSeen?.aborted, false);
});

test("runUntilEscape passes on errors that did not come from Esc and stops listening", async () => {
  const keys = new EventEmitter();

  await assert.rejects(
    runUntilEscape(async () => {
      throw new Error("terminal closed");
    }, keys),
    /terminal closed/,
  );
  assert.equal(keys.listenerCount("keypress"), 0);
});
