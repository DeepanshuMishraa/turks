#!/usr/bin/env node
import * as p from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { ProcessCommandRunner } from "./core/command.js";
import { formatPlan } from "./core/format-plan.js";
import { generateProject } from "./core/generate.js";
import { Planner } from "./core/planner.js";
import { resolveInput, type CliOptions, type InputError } from "./cli/input.js";
import type { ConfigIssue } from "./core/config.js";

const program = new Command()
  .name("turks")
  .description("Compose a polyglot application stack into one working monorepo.")
  .version("0.1.0")
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
  .option("--package-manager <manager>", "package manager (pnpm)")
  .option("--orchestrator <orchestrator>", "workspace orchestrator: none (default) or moon")
  .option("--preset <preset>", "preset: expo-rust, expo-rust-postgres, or next-go")
  .option("--moon", "add an optional Moon workspace (advanced)")
  .option("--docker", "add Docker Compose")
  .option("--ci <provider>", "CI provider (github)")
  .option("--yes", "accept smart defaults for missing choices")
  .option("--dry-run", "print the generation plan without writing files")
  .option("--no-install", "skip dependency installation")
  .option("--no-git", "skip Git initialization");

function showInputError(error: InputError | readonly ConfigIssue[]): void {
  const issues = Array.isArray(error) ? error : [error];
  for (const issue of issues) {
    console.error(chalk.red.bold("✖ ") + chalk.red(issue.message));
    console.error(chalk.dim(issue.recovery));
  }
}

async function main(): Promise<void> {
  program.parse();
  const parsedOptions = program.opts<CliOptions>();
  const { git: parsedGit, ...optionsWithoutGit } = parsedOptions;
  const options: CliOptions = program.getOptionValueSource("git") === "cli" && parsedGit !== undefined
    ? { ...optionsWithoutGit, git: parsedGit }
    : optionsWithoutGit;
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

  console.log(chalk.cyan(`\nCreating ${configResult.value.projectName}...\n`));
  const generation = await generateProject({
    config: configResult.value,
    plan: planResult.value,
    runner: new ProcessCommandRunner(),
    onProgress: ({ completed, total, label }) => {
      console.log(`${chalk.green("✓")} ${chalk.white(label)} ${chalk.dim(`(${completed}/${total})`)}`);
    },
  });

  if (!generation.ok) {
    console.error(`\n${chalk.red.bold("✖ Generation failed")}`);
    console.error(chalk.red(generation.error.message));
    console.error(chalk.dim(generation.error.recovery));
    process.exitCode = 1;
    return;
  }

  const nextCommand = configResult.value.destination === process.cwd() ? "pnpm dev" : `cd ${configResult.value.projectName}\n  pnpm dev`;
  p.outro(`${chalk.green.bold("Done.")}\n\n  ${chalk.cyan(nextCommand)}`);
}

await main();
