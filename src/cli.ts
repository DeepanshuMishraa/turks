#!/usr/bin/env node
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { ProcessCommandRunner } from "./core/command.js";
import { formatPlan } from "./core/format-plan.js";
import { generateProject } from "./core/generate.js";
import { Planner } from "./core/planner.js";
import { Templates } from "./generators/template.js";
import { resolveInput, type CliOptions, type InputError } from "./cli/input.js";
import type { ConfigIssue } from "./core/config.js";

async function packageVersion(): Promise<string> {
  const manifest: unknown = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest) || typeof manifest.version !== "string") {
    throw new TypeError("package.json must contain a string version.");
  }
  return manifest.version;
}

const program = new Command()
  .name("turks")
  .description("Compose a polyglot application stack into one working monorepo.")
  .version(await packageVersion())
  .argument("[project-name]", "project directory name")
  .option("--client <clients>", "comma-separated clients, or none")
  .option("--mobile <framework>", "alias for --client")
  .option("--backend <backend>", "backend: rust, go, typescript, python, or none")
  .option("--framework <framework>", "framework for the selected backend language")
  .option("--rust-framework <framework>", "Rust framework: none, axum, actix-web, or rocket")
  .option("--go-framework <framework>", "Go framework: none, stdlib, chi, gin, fiber, or echo")
  .option("--typescript-framework <framework>", "TypeScript framework: none, hono, express, fastify, or nest")
  .option("--python-framework <framework>", "Python framework: none, fastapi, django, flask, or litestar")
  .option("--database <database>", "database: none, postgres, mysql, sqlite, or mongodb")
  .option("--data-layer <library>", "compatible ORM, query builder, driver, or none")
  .option("--db-client <library>", "alias for --data-layer")
  .option("--template <template>", "starter template: none (default) or gpui-starter")
  .option("--package-manager <manager>", "package manager: npm, pnpm, or bun")
  .option("--orchestrator <orchestrator>", "workspace orchestrator: none (default) or moon")
  .option("--preset <preset>", "preset: expo-rust, expo-rust-postgres, or next-go")
  .option("--moon", "add an optional Moon workspace (advanced)")
  .option("--docker", "add Docker Compose")
  .option("--no-docker", "do not add Docker Compose")
  .option("--ci <provider>", "CI provider (github)")
  .option("--no-ci", "do not add CI")
  .option("--yes", "accept smart defaults for missing choices")
  .option("--dry-run", "print the generation plan without writing files")
  .option("--force", "merge into a non-empty destination without prompting")
  .option("--no-install", "skip dependency installation")
  .option("--no-git", "skip Git initialization");

function showInputError(error: InputError | readonly ConfigIssue[]): void {
  const issues = Array.isArray(error) ? error : [error];
  for (const issue of issues) {
    console.error(chalk.red.bold("✖ ") + chalk.red(issue.message));
    console.error(chalk.dim(issue.recovery));
  }
}

async function directoryHasFiles(destination: string): Promise<boolean> {
  try {
    return (await readdir(destination)).length > 0;
  } catch {
    return false;
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  program.parse();
  const parsedOptions = program.opts<CliOptions>();
  const { git: parsedGit, install: parsedInstall, ...optionsWithoutBooleanDefaults } = parsedOptions;
  const optionsWithGit: CliOptions = program.getOptionValueSource("git") === "cli" && parsedGit !== undefined
    ? { ...optionsWithoutBooleanDefaults, git: parsedGit }
    : optionsWithoutBooleanDefaults;
  const options: CliOptions = program.getOptionValueSource("install") === "cli" && parsedInstall !== undefined
    ? { ...optionsWithGit, install: parsedInstall }
    : optionsWithGit;
  const projectName = program.args.at(0);

  p.intro(chalk.bgCyan.black(" turks ") + chalk.dim(" build your stack. get your repo."));
  const configResult = await resolveInput(process.cwd(), projectName, options);
  if (!configResult.ok) {
    showInputError(configResult.error);
    process.exitCode = 1;
    return;
  }

  const planResult = Planner.create(configResult.value);
  if (!planResult.ok) {
    console.error(chalk.red.bold("✖ ") + chalk.red(planResult.error.message));
    console.error(chalk.dim(planResult.error.recovery));
    process.exitCode = 1;
    return;
  }

  if (options.dryRun === true) {
    console.log(`\n${chalk.cyan.bold("Generation plan")}\n${formatPlan(configResult.value, planResult.value)}\n`);
    p.outro(chalk.green("Dry run complete. No files were written."));
    return;
  }

  let mergeIntoExisting = false;
  if (await directoryHasFiles(configResult.value.destination)) {
    console.warn(chalk.yellow(`Warning: '${configResult.value.destination}' already contains files.`));
    if (options.force === true) {
      mergeIntoExisting = true;
    } else {
      const confirmed = await p.confirm({
        message: "Continue and overwrite files that conflict with the generated project?",
        initialValue: false,
      });
      if (p.isCancel(confirmed) || !confirmed) {
        p.outro(chalk.dim("Generation cancelled. Existing files were preserved."));
        return;
      }
      mergeIntoExisting = true;
    }
  }

  if (configResult.value.initializeGit && await pathExists(path.join(configResult.value.destination, ".git"))) {
    console.log(chalk.dim("Git repository is already initialized. The existing root repository will be preserved."));
  }

  console.log(chalk.cyan(`\nCreating ${configResult.value.projectName}...\n`));
  const generation = await generateProject({
    config: configResult.value,
    plan: planResult.value,
    runner: new ProcessCommandRunner(),
    mergeIntoExisting,
    onProgress: ({ completed, total, label }) => {
      console.log(`${chalk.green("✓")} ${chalk.white(label)} ${chalk.dim(`(${completed}/${total})`)}`);
    },
    onWarning: (warning) => {
      console.warn(chalk.yellow(`Warning: ${warning}`));
    },
  });

  if (!generation.ok) {
    console.error(`\n${chalk.red.bold("✖ Generation failed")}`);
    console.error(chalk.red(generation.error.message));
    console.error(chalk.dim(generation.error.recovery));
    process.exitCode = 1;
    return;
  }

  const packageManager = configResult.value.packageManager;
  const nextSteps = configResult.value.template === "none"
    ? [
        ...(configResult.value.destination === process.cwd() ? [] : [`cd ${configResult.value.projectName}`]),
        ...(configResult.value.install ? [] : [`${packageManager} install`]),
        [`${packageManager} run dev`],
      ]
    : [
        ...(configResult.value.destination === process.cwd() ? [] : [`cd ${configResult.value.projectName}`]),
        ...(configResult.value.install ? [] : [Templates.build(configResult.value) ?? "cargo build"]),
        Templates.run(configResult.value) ?? "cargo run",
      ];
  const nextCommand = nextSteps.join("\n  ");
  p.outro(`${chalk.green.bold("Done.")}\n\n  ${chalk.cyan(nextCommand)}`);
}

await main();
