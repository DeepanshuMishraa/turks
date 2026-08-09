import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, rename, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import type { CommandRunner } from "./command.js";
import type { StackConfig } from "./config.js";
import type { GenerationError } from "./generator.js";
import type { GenerationPlan } from "./planner.js";
import { Result, type Result as ResultValue } from "./result.js";

export type Progress = {
  readonly completed: number;
  readonly total: number;
  readonly label: string;
};

export type GenerateOptions = {
  readonly config: StackConfig;
  readonly plan: GenerationPlan;
  readonly runner: CommandRunner;
  readonly onProgress?: (progress: Progress) => void;
};

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown filesystem error.";
}

async function cleanup(target: string): Promise<string | undefined> {
  try {
    await rm(target, { recursive: true, force: true });
    return undefined;
  } catch (error) {
    return errorDetail(error);
  }
}

function failed(
  message: string,
  recovery: string,
  generator?: GenerationError["generator"],
): ResultValue<never, GenerationError> {
  return Result.error({
    code: "generation-failed",
    ...(generator === undefined ? {} : { generator }),
    message,
    recovery,
  });
}

export async function generateProject(
  options: GenerateOptions,
): Promise<ResultValue<string, GenerationError>> {
  const destinationExists = await exists(options.config.destination);
  if (destinationExists) {
    try {
      const entries = await readdir(options.config.destination);
      if (entries.length > 0) {
        return Result.error({
          code: "destination-exists",
          message: `Destination '${options.config.destination}' is not empty.`,
          recovery: "Choose a new project name or use an empty directory. Existing files were preserved.",
        });
      }
    } catch {
      return Result.error({
        code: "destination-exists",
        message: `Destination '${options.config.destination}' cannot be used as an empty directory.`,
        recovery: "Choose a new project name or use an accessible empty directory. Existing files were preserved.",
      });
    }
  }

  const parent = path.dirname(options.config.destination);
  const temporary = path.join(parent, `.${options.config.projectName}.turks-${randomUUID()}`);
  try {
    await mkdir(parent, { recursive: true });
    await mkdir(temporary);
  } catch (error) {
    const cleanupError = await cleanup(temporary);
    const cleanupDetail = cleanupError === undefined ? "" : ` Cleanup also failed: ${cleanupError}`;
    return failed(
      `Could not prepare temporary project files: ${errorDetail(error)}${cleanupDetail}`,
      "Check directory permissions and available disk space, then rerun turks. The destination was preserved.",
    );
  }

  for (const [index, generator] of options.plan.generators.entries()) {
    try {
      const result = await generator.generate({
        rootDir: temporary,
        config: options.config,
        runner: options.runner,
      });
      if (!result.ok) {
        const cleanupError = await cleanup(temporary);
        if (cleanupError === undefined) return result;
        return failed(
          `${result.error.message} Cleanup also failed: ${cleanupError}`,
          result.error.recovery,
          result.error.generator,
        );
      }
      options.onProgress?.({
        completed: index + 1,
        total: options.plan.generators.length,
        label: generator.label,
      });
    } catch (error) {
      const cleanupError = await cleanup(temporary);
      const cleanupDetail = cleanupError === undefined ? "" : ` Cleanup also failed: ${cleanupError}`;
      return failed(
        `Generator '${generator.id}' stopped unexpectedly: ${errorDetail(error)}${cleanupDetail}`,
        "Fix the reported problem, then rerun turks. The incomplete project was not kept.",
        generator.id,
      );
    }
  }

  const destinationIsCurrentDirectory = path.resolve(options.config.destination) === path.resolve(process.cwd());
  const movedIntoCurrentDirectory: string[] = [];
  try {
    if (destinationExists && destinationIsCurrentDirectory) {
      for (const entry of await readdir(temporary)) {
        await rename(path.join(temporary, entry), path.join(options.config.destination, entry));
        movedIntoCurrentDirectory.push(entry);
      }
      await rmdir(temporary);
    } else {
      if (destinationExists) await rmdir(options.config.destination);
      await rename(temporary, options.config.destination);
    }
    return Result.ok(options.config.destination);
  } catch (error) {
    const cleanupErrors: string[] = [];
    for (const entry of movedIntoCurrentDirectory) {
      const cleanupError = await cleanup(path.join(options.config.destination, entry));
      if (cleanupError !== undefined) cleanupErrors.push(cleanupError);
    }
    const temporaryCleanupError = await cleanup(temporary);
    if (temporaryCleanupError !== undefined) cleanupErrors.push(temporaryCleanupError);
    if (destinationExists && !destinationIsCurrentDirectory && !(await exists(options.config.destination))) {
      try {
        await mkdir(options.config.destination, { recursive: true });
      } catch (restoreError) {
        cleanupErrors.push(`Could not restore the empty destination: ${errorDetail(restoreError)}`);
      }
    }
    const cleanupDetail = cleanupErrors.length === 0 ? "" : ` Cleanup issues: ${cleanupErrors.join("; ")}`;
    return failed(
      `Could not finalize '${options.config.destination}': ${errorDetail(error)}${cleanupDetail}`,
      "Check directory permissions, then rerun turks. Existing files were preserved.",
    );
  }
}
