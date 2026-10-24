import type { ChalkInstance } from "chalk";
import { UsageError } from "./install-command.ts";
import { SelectionError } from "./selection.ts";
import { InstallError } from "./skills/install.ts";
import { SkillError } from "./skills/skill.ts";

const USER_ERRORS = [SkillError, SelectionError, InstallError, UsageError];

export function isUserError(error: unknown): error is Error {
  return USER_ERRORS.some((errorClass) => error instanceof errorClass);
}

export function formatUserError(error: Error, colors: ChalkInstance): string {
  return colors.red(`Error: ${error.message}`);
}
