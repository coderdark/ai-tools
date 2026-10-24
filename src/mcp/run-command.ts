import { execFile, type ExecFileException } from "node:child_process";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

/** A command that could not be run at all. Its message never contains the arguments, which can hold secrets. */
export class McpCommandError extends Error {}

const DEFAULT_TIMEOUT_MS = 60_000;

function describeFailure(command: string, error: ExecFileException): string {
  if (error.code === "ENOENT") {
    return `${command} was not found`;
  }

  if (error.killed) {
    return `${command} did not finish in time`;
  }

  return `${command} could not be run`;
}

/** Runs a command with no shell. A non-zero exit is a result, not an error. */
export function runCommand(command: string, args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, encoding: "utf8" }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ exitCode: 0, stdout, stderr });

        return;
      }

      if (typeof error.code === "number") {
        resolve({ exitCode: error.code, stdout, stderr });

        return;
      }

      reject(new McpCommandError(describeFailure(command, error)));
    });
  });
}
