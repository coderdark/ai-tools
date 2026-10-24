import ora from "ora";
import type { InstallProgress } from "./install-command.ts";

export interface Spinner {
  text: string;
  start(text?: string): unknown;
  succeed(text?: string): unknown;
  fail(text?: string): unknown;
}

export function createSpinner(
  env: NodeJS.ProcessEnv = process.env,
  stream: NodeJS.WritableStream = process.stderr,
): Spinner {
  return ora({ stream, isEnabled: env.NO_COLOR ? false : undefined });
}

export function createProgress(spinner: Spinner = createSpinner()): InstallProgress {
  return {
    start: (text) => spinner.start(text),
    update: (text) => {
      spinner.text = text;
    },
    succeed: (text) => spinner.succeed(text),
    fail: (text) => spinner.fail(text),
  };
}
