import { spawn } from "node:child_process";
import { Result, type Result as ResultValue } from "./result.js";

export type Command = {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
};

export type CommandError = {
  readonly code: "command-failed" | "command-not-found";
  readonly command: Command;
  readonly exitCode: number | null;
  readonly message: string;
};

export interface CommandRunner {
  run(command: Command): Promise<ResultValue<void, CommandError>>;
}

export class ProcessCommandRunner implements CommandRunner {
  async run(command: Command): Promise<ResultValue<void, CommandError>> {
    return await new Promise((resolve) => {
      const child = spawn(command.executable, [...command.args], {
        cwd: command.cwd,
        stdio: "inherit",
        env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
      });

      child.once("error", (error) => {
        resolve(
          Result.error({
            code: "command-not-found",
            command,
            exitCode: null,
            message: `Could not start '${command.executable}': ${error.message}`,
          }),
        );
      });

      child.once("exit", (exitCode) => {
        if (exitCode === 0) {
          resolve(Result.ok(undefined));
          return;
        }

        resolve(
          Result.error({
            code: "command-failed",
            command,
            exitCode,
            message: `Command exited with code ${String(exitCode)}.`,
          }),
        );
      });
    });
  }
}
