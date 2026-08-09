import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "../core/command.js";
import type { GenerationContext } from "../core/context.js";
import type { GenerationError, GeneratorId } from "../core/generator.js";
import { Result, type Result as ResultValue } from "../core/result.js";

export async function writeProjectFile(
  context: GenerationContext,
  relativePath: string,
  contents: string,
): Promise<void> {
  const destination = path.join(context.rootDir, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents, "utf8");
}

export async function writeProjectJson(
  context: GenerationContext,
  relativePath: string,
  value: object,
): Promise<void> {
  await writeProjectFile(context, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function mergeProjectPackageJson(
  context: GenerationContext,
  relativePath: string,
  additions: {
    readonly scripts?: Readonly<Record<string, string>>;
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly devDependencies?: Readonly<Record<string, string>>;
  },
): Promise<void> {
  const destination = path.join(context.rootDir, relativePath);
  const contents = await readFile(destination, "utf8");
  const parsed: unknown = JSON.parse(contents);
  if (!isRecord(parsed)) throw new Error(`${relativePath} does not contain a JSON object.`);

  const scripts = isRecord(parsed.scripts) ? parsed.scripts : {};
  const dependencies = isRecord(parsed.dependencies) ? parsed.dependencies : {};
  const devDependencies = isRecord(parsed.devDependencies) ? parsed.devDependencies : {};
  await writeProjectJson(context, relativePath, {
    ...parsed,
    scripts: { ...scripts, ...additions.scripts },
    dependencies: { ...dependencies, ...additions.dependencies },
    devDependencies: { ...devDependencies, ...additions.devDependencies },
  });
}

export async function mergeProjectCompilerOptions(
  context: GenerationContext,
  relativePath: string,
  additions: Readonly<Record<string, unknown>>,
): Promise<void> {
  const destination = path.join(context.rootDir, relativePath);
  const contents = await readFile(destination, "utf8");
  const parsed: unknown = JSON.parse(contents);
  if (!isRecord(parsed)) throw new Error(`${relativePath} does not contain a JSON object.`);

  const compilerOptions = isRecord(parsed.compilerOptions) ? parsed.compilerOptions : {};
  await writeProjectJson(context, relativePath, {
    ...parsed,
    compilerOptions: { ...compilerOptions, ...additions },
  });
}

export async function replaceProjectFile(
  context: GenerationContext,
  relativePath: string,
  transform: (contents: string) => string,
): Promise<void> {
  const destination = path.join(context.rootDir, relativePath);
  const contents = await readFile(destination, "utf8");
  await writeFile(destination, transform(contents), "utf8");
}

export async function runGeneratorCommand(
  context: GenerationContext,
  generator: GeneratorId,
  command: Omit<Command, "cwd"> & { readonly cwd?: string },
): Promise<ResultValue<void, GenerationError>> {
  const cwd = command.cwd ?? context.rootDir;
  const result = await context.runner.run({
    executable: command.executable,
    args: command.args,
    cwd,
  });

  if (result.ok) {
    return Result.ok(undefined);
  }

  const rendered = [result.error.command.executable, ...result.error.command.args].join(" ");
  return Result.error({
    code: "generation-failed",
    generator,
    message: `${result.error.message}\n\nCommand: ${rendered}`,
    recovery: `Fix the reported '${result.error.command.executable}' problem, then rerun turks. The incomplete project was not kept.`,
  });
}

export function generationFailure(
  generator: GeneratorId,
  error: unknown,
): ResultValue<never, GenerationError> {
  const detail = error instanceof Error ? error.message : "Unknown filesystem error.";
  return Result.error({
    code: "generation-failed",
    generator,
    message: `Failed while generating ${generator}: ${detail}`,
    recovery: "Check file permissions and available disk space, then rerun turks. The incomplete project was not kept.",
  });
}
