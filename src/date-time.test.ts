import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { formatDateTime } from "./date-time.ts";

function inTimeZone(t: TestContext, zone: string): void {
  const original = process.env.TZ;

  process.env.TZ = zone;
  t.after(() => {
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  });
}

test("formatDateTime prints local time to the minute with the offset, in summer time", (t) => {
  inTimeZone(t, "America/Chicago");

  assert.equal(formatDateTime(new Date(2026, 4, 9, 9, 5)), "2026-05-09T09:05-05:00");
});

test("formatDateTime uses the offset in force on that date, so winter differs from summer", (t) => {
  inTimeZone(t, "America/Chicago");

  assert.equal(formatDateTime(new Date(2026, 0, 15, 17, 45)), "2026-01-15T17:45-06:00");
});

test("formatDateTime keeps the minutes of a half-hour offset", (t) => {
  inTimeZone(t, "Asia/Kolkata");

  assert.equal(formatDateTime(new Date(2026, 4, 9, 9, 5)), "2026-05-09T09:05+05:30");
});

test("formatDateTime writes a zero offset as +00:00", (t) => {
  inTimeZone(t, "UTC");

  assert.equal(formatDateTime(new Date(2026, 4, 9, 9, 5)), "2026-05-09T09:05+00:00");
});
