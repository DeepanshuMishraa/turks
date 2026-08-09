import { access, mkdir, readdir, rename, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
  await mkdir(parent, { recursive: true });
  await mkdir(temporary);

  for (const [index, generator] of options.plan.generators.entries()) {
    const result = await generator.generate({
      rootDir: temporary,
      config: options.config,
      runner: options.runner,
    });
    if (!result.ok) {
      await rm(temporary, { recursive: true, force: true });
      return result;
    }
    options.onProgress?.({
      completed: index + 1,
      total: options.plan.generators.length,
      label: generator.label,
    });
  }

  try {
    if (destinationExists) await rmdir(options.config.destination);
    await rename(temporary, options.config.destination);
    return Result.ok(options.config.destination);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    if (destinationExists && !(await exists(options.config.destination))) {
      await mkdir(options.config.destination, { recursive: true });
    }
    const detail = error instanceof Error ? error.message : "Unknown filesystem error.";
    return Result.error({
      code: "generation-failed",
      message: `Could not finalize '${options.config.destination}': ${detail}`,
      recovery: "Check directory permissions, then rerun turks. The incomplete project was removed.",
    });
  }
}
