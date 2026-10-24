import type { ChalkInstance } from "chalk";
import { CommanderError, type Command } from "commander";
import { UsageError } from "./install-command.ts";
import { SelectionError } from "./selection.ts";
import { InstallError } from "./skills/install.ts";
import { SkillError } from "./skills/skill.ts";

export interface CliOutput {
  error(line: string): void;
  colors: ChalkInstance;
}

const USER_ERRORS = [SkillError, SelectionError, InstallError, UsageError];
const EXIT_AFTER_CTRL_C = 130;

function isUserError(error: unknown): error is Error {
  return USER_ERRORS.some((errorClass) => error instanceof errorClass);
}

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
      printError(colors.red(`Error: ${error.message}`));

      return 1;
    }

    const details = error instanceof Error ? (error.stack ?? error.message) : String(error);

    printError(colors.red(`Unexpected error: ${details}`));

    return 1;
  }
}
