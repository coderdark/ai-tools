import type { ChalkInstance } from "chalk";
import { CommanderError, type Command } from "commander";
import { formatUserError, isUserError } from "./user-error.ts";

export interface CliOutput {
  error(line: string): void;
  colors: ChalkInstance;
}

const EXIT_AFTER_CTRL_C = 130;

function isCancelledPrompt(error: unknown): boolean {
  return error instanceof Error && error.name === "ExitPromptError";
}

export async function runCli(
  program: Command,
  args: string[],
  { error: printError, colors }: CliOutput,
): Promise<number> {
  try {
    await program.exitOverride().parseAsync(args, { from: "user" });

    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }

    if (isCancelledPrompt(error)) {
      return EXIT_AFTER_CTRL_C;
    }

    if (isUserError(error)) {
      printError(formatUserError(error, colors));

      return 1;
    }

    const details = error instanceof Error ? (error.stack ?? error.message) : String(error);

    printError(colors.red(`Unexpected error: ${details}`));

    return 1;
  }
}
