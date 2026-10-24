import { test } from "node:test";
import assert from "node:assert/strict";
import { Chalk } from "chalk";
import { createColors } from "./colors.ts";

const colorful = new Chalk({ level: 1 });

test("createColors keeps the given colors when NO_COLOR is not set", () => {
  assert.equal(createColors({}, colorful), colorful);
});

test("createColors keeps the given colors when NO_COLOR is empty", () => {
  assert.equal(createColors({ NO_COLOR: "" }, colorful), colorful);
});

test("createColors turns colors off when NO_COLOR is set", () => {
  const colors = createColors({ NO_COLOR: "1" }, colorful);

  assert.equal(colors.level, 0);
  assert.equal(colors.green("ok"), "ok");
});
