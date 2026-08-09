import { randomUUID } from "node:crypto";
import { access, lstat, mkdir, readdir, rename, rm, rmdir } from "node:fs/promises";
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
  readonly mergeIntoExisting?: boolean;
  readonly onProgress?: (progress: Progress) => void;
  readonly onWarning?: (warning: string) => void;
};

type OverlayChange =
  | { readonly kind: "created"; readonly destination: string }
  | { readonly kind: "replaced"; readonly destination: string; readonly backup: string };

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

async function overlayDirectory(
  source: string,
  destination: string,
  backup: string,
  changes: OverlayChange[],
  relativeDirectory = "",
): Promise<void> {
  const sourceDirectory = path.join(source, relativeDirectory);
  for (const entry of await readdir(sourceDirectory)) {
    const relativePath = path.join(relativeDirectory, entry);
    const sourcePath = path.join(source, relativePath);
    const destinationPath = path.join(destination, relativePath);
    const sourceStats = await lstat(sourcePath);
    const destinationExists = await exists(destinationPath);

    if (relativePath === ".git" && destinationExists) {
      const cleanupError = await cleanup(sourcePath);
      if (cleanupError !== undefined) throw new Error(`Could not discard temporary Git metadata: ${cleanupError}`);
      continue;
    }

    if (sourceStats.isDirectory() && destinationExists && (await lstat(destinationPath)).isDirectory()) {
      await overlayDirectory(source, destination, backup, changes, relativePath);
      await rmdir(sourcePath);
      continue;
    }

    if (destinationExists) {
      const backupPath = path.join(backup, relativePath);
      await mkdir(path.dirname(backupPath), { recursive: true });
      await rename(destinationPath, backupPath);
      changes.push({ kind: "replaced", destination: destinationPath, backup: backupPath });
    } else {
      changes.push({ kind: "created", destination: destinationPath });
    }
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await rename(sourcePath, destinationPath);
  }
}

async function rollbackOverlay(changes: readonly OverlayChange[]): Promise<readonly string[]> {
  const errors: string[] = [];
  for (const change of [...changes].reverse()) {
    const removalError = await cleanup(change.destination);
    if (removalError !== undefined) errors.push(removalError);
    if (change.kind === "replaced") {
      try {
        await mkdir(path.dirname(change.destination), { recursive: true });
        await rename(change.backup, change.destination);
      } catch (error) {
        errors.push(`Could not restore '${change.destination}': ${errorDetail(error)}`);
      }
    }
  }
  return errors;
}

async function removeNestedGitArtifacts(root: string, relativeDirectory = ""): Promise<readonly string[]> {
  const directory = path.join(root, relativeDirectory);
  let entries: readonly string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    return [`Could not inspect '${relativeDirectory || "."}' for nested Git metadata: ${errorDetail(error)}`];
  }

  const warnings: string[] = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry);
    const entryPath = path.join(root, relativePath);
    if (entry === ".git") {
      if (relativeDirectory !== "") {
        const cleanupError = await cleanup(entryPath);
        if (cleanupError !== undefined) warnings.push(`Could not remove nested Git metadata at '${relativePath}': ${cleanupError}`);
      }
      continue;
    }
    if (entry === "node_modules") continue;
    try {
      if ((await lstat(entryPath)).isDirectory()) {
        warnings.push(...await removeNestedGitArtifacts(root, relativePath));
      }
    } catch (error) {
      warnings.push(`Could not inspect '${relativePath}' for nested Git metadata: ${errorDetail(error)}`);
    }
  }
  return warnings;
}

export async function generateProject(
  options: GenerateOptions,
): Promise<ResultValue<string, GenerationError>> {
  const destinationExists = await exists(options.config.destination);
  let destinationHasEntries = false;
  if (destinationExists) {
    try {
      const entries = await readdir(options.config.destination);
      destinationHasEntries = entries.length > 0;
      if (destinationHasEntries && options.mergeIntoExisting !== true) {
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
  const backup = path.join(parent, `.${options.config.projectName}.turks-backup-${randomUUID()}`);
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
  const overlayChanges: OverlayChange[] = [];
  const shouldOverlay = destinationExists && (destinationIsCurrentDirectory || destinationHasEntries);
  try {
    for (const warning of await removeNestedGitArtifacts(temporary)) {
      options.onWarning?.(`${warning} The generated project may contain nested Git metadata.`);
    }
    if (shouldOverlay) {
      await mkdir(backup);
      await overlayDirectory(temporary, options.config.destination, backup, overlayChanges);
      await rmdir(temporary);
      const backupCleanupError = await cleanup(backup);
      if (backupCleanupError !== undefined) {
        return failed(
          `Project generation completed, but backup cleanup failed: ${backupCleanupError}`,
          `The generated project is usable. Remove the leftover backup directory '${backup}' manually.`,
        );
      }
    } else {
      if (destinationExists) await rmdir(options.config.destination);
      await rename(temporary, options.config.destination);
    }
    return Result.ok(options.config.destination);
  } catch (error) {
    const cleanupErrors = [...await rollbackOverlay(overlayChanges)];
    const temporaryCleanupError = await cleanup(temporary);
    if (temporaryCleanupError !== undefined) cleanupErrors.push(temporaryCleanupError);
    const backupCleanupError = await cleanup(backup);
    if (backupCleanupError !== undefined) cleanupErrors.push(backupCleanupError);
    if (destinationExists && !shouldOverlay && !(await exists(options.config.destination))) {
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
