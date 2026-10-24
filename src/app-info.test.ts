import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppInfo } from "./app-info.ts";

test("readAppInfo reads the name, version and description from package.json", () => {
  const info = readAppInfo(() => JSON.stringify({ name: "ai-tools", version: "1.2.3", description: "Does things.", extra: 1 }));

  assert.deepEqual(info, { name: "ai-tools", version: "1.2.3", description: "Does things." });
});

test("readAppInfo asks for package.json one folder above the code, which is the same from src and from dist", () => {
  const asked: string[] = [];

  readAppInfo((url) => {
    asked.push(url.pathname);

    return JSON.stringify({ name: "a", version: "1", description: "d" });
  });

  assert.equal(asked.length, 1);
  assert.match(asked[0] ?? "", /\/package\.json$/);
  assert.doesNotMatch(asked[0] ?? "", /\/src\/package\.json$/);
});

test("readAppInfo refuses a package.json that is missing a field, and says which", () => {
  assert.throws(() => readAppInfo(() => JSON.stringify({ name: "a", version: "1" })), /description/);
  assert.throws(() => readAppInfo(() => JSON.stringify({ version: "1", description: "d" })), /name/);
  assert.throws(() => readAppInfo(() => "not json"));
});

test("readAppInfo reads this project's own package.json by default", () => {
  assert.equal(readAppInfo().name, "ai-tools");
});
