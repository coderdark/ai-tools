import ora from "ora";
import type { InstallProgress } from "./install-command.ts";

export interface Spinner {
  text: string;
  start(text?: string): unknown;
  succeed(text?: string): unknown;
  fail(text?: string): unknown;
}

export function createProgress(spinner: Spinner = ora()): InstallProgress {
  return {
    start: (text) => spinner.start(text),
    update: (text) => {
      spinner.text = text;
    },
    succeed: (text) => spinner.succeed(text),
    fail: (text) => spinner.fail(text),
  };
}
