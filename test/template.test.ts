import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Command, CommandRunner } from "../src/core/command.js";
import type { StackConfig } from "../src/core/config.js";
import { generateProject } from "../src/core/generate.js";
import { Planner } from "../src/core/planner.js";
import { Result, type Result as ResultValue } from "../src/core/result.js";
import type { CommandError } from "../src/core/command.js";

class TemplateCommandRunner implements CommandRunner {
  readonly commands: Command[] = [];

  async run(command: Command): Promise<ResultValue<void, CommandError>> {
    this.commands.push(command);
    if (command.executable === "git" && command.args[0] === "init") {
      await mkdir(path.join(command.cwd, ".git"));
    }
    return Result.ok(undefined);
  }
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

function templateConfig(destination: string, overrides: Partial<StackConfig> = {}): StackConfig {
  return {
    projectName: "my-app",
    destination,
    template: "gpui-starter",
    clients: [],
    backend: { kind: "none" },
    database: { kind: "none" },
    packageManager: "pnpm",
    orchestrator: "none",
    docker: false,
    githubActions: false,
    install: false,
    initializeGit: false,
    ...overrides,
  };
}

describe("template generation", () => {
  it("scaffolds the gpui-starter template renamed to the project", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "turks-template-"));
    temporaryDirectories.push(parent);
    const destination = path.join(parent, "my-app");
    await mkdir(destination);
    const config = templateConfig(destination, { install: true });
    const plan = Planner.create(config);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const runner = new TemplateCommandRunner();
    const result = await generateProject({ config, plan: plan.value, runner });
    expect(result).toEqual({ ok: true, value: destination });

    const workspace = await readFile(path.join(destination, "Cargo.toml"), "utf8");
    expect(workspace).toContain('my-app-ui = { path = "crates/ui" }');
    expect(workspace).not.toContain("gpui-starter");

    const desktopManifest = await readFile(path.join(destination, "crates/desktop/Cargo.toml"), "utf8");
    expect(desktopManifest).toContain('name = "my-app-desktop"');
    expect(desktopManifest).toContain('name = "my-app"');
    expect(desktopManifest).toContain("my-app-ui.workspace = true");

    const uiManifest = await readFile(path.join(destination, "crates/ui/Cargo.toml"), "utf8");
    expect(uiManifest).toContain('name = "my-app-ui"');

    const main = await readFile(path.join(destination, "crates/desktop/src/main.rs"), "utf8");
    expect(main).toContain("use my_app_ui::RootView;");
    expect(main).toContain("actions!(my_app, [Quit]);");
    expect(main).toContain('app_id: Some("com.my-app.app"');
    expect(main).toContain('title: Some("My App"');
    expect(main).toContain('"Quit My App"');

    const readme = await readFile(path.join(destination, "README.md"), "utf8");
    expect(readme).toContain("cargo run --release -p my-app-desktop");

    const justfile = await readFile(path.join(destination, "justfile"), "utf8");
    expect(justfile).toContain("-p my-app-desktop");
    expect(justfile).toContain("-p my-app-ui");

    const sourceIcon = await readFile(path.resolve("templates/gpui-starter/crates/desktop/assets/app-icon.png"));
    const generatedIcon = await readFile(path.join(destination, "crates/desktop/assets/app-icon.png"));
    expect(generatedIcon.equals(sourceIcon)).toBe(true);

    expect(runner.commands.some((command) => command.executable === "cargo" && command.args.length === 1 && command.args[0] === "build")).toBe(true);
  });

  it("keeps the template verbatim when the project name already matches", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "turks-template-name-"));
    temporaryDirectories.push(parent);
    const destination = path.join(parent, "gpui-starter");
    await mkdir(destination);
    const config = templateConfig(destination, { projectName: "gpui-starter" });
    const plan = Planner.create(config);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const result = await generateProject({ config, plan: plan.value, runner: new TemplateCommandRunner() });
    expect(result).toEqual({ ok: true, value: destination });

    const main = await readFile(path.join(destination, "crates/desktop/src/main.rs"), "utf8");
    expect(main).toContain("use gpui_starter_ui::RootView;");
    const workspace = await readFile(path.join(destination, "Cargo.toml"), "utf8");
    expect(workspace).toContain('gpui-starter-ui = { path = "crates/ui" }');
  });

  it("initializes Git after the template when requested", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "turks-template-git-"));
    temporaryDirectories.push(parent);
    const destination = path.join(parent, "my-app");
    await mkdir(destination);
    const config = templateConfig(destination, { initializeGit: true });
    const plan = Planner.create(config);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const runner = new TemplateCommandRunner();
    const result = await generateProject({ config, plan: plan.value, runner });
    expect(result).toEqual({ ok: true, value: destination });
    expect(runner.commands.some((command) => command.executable === "git" && command.args[0] === "init")).toBe(true);
    await expect(readFile(path.join(destination, "Cargo.toml"), "utf8")).resolves.toContain('[workspace]');
  });

  it("preserves the template structure exactly", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "turks-template-structure-"));
    temporaryDirectories.push(parent);
    const destination = path.join(parent, "my-app");
    await mkdir(destination);
    const config = templateConfig(destination);
    const plan = Planner.create(config);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const result = await generateProject({ config, plan: plan.value, runner: new TemplateCommandRunner() });
    expect(result).toEqual({ ok: true, value: destination });

    const expectedFiles = [
      "Cargo.toml",
      "Cargo.lock",
      "README.md",
      "AGENTS.md",
      "justfile",
      ".gitignore",
      "crates/desktop/Cargo.toml",
      "crates/desktop/src/main.rs",
      "crates/desktop/assets/app-icon.png",
      "crates/desktop/assets/app-icon-source.png",
      "crates/ui/Cargo.toml",
      "crates/ui/src/button.rs",
      "crates/ui/src/lib.rs",
      "crates/ui/src/theme.rs",
      "crates/ui/themes/groknight.json",
    ];
    for (const relative of expectedFiles) {
      await expect(readFile(path.join(destination, relative), "utf8").catch(() => "")).resolves.toBeTruthy();
    }
    const lockfile = await readFile(path.join(destination, "Cargo.lock"), "utf8");
    expect(lockfile).toContain('name = "my-app-desktop"');
    expect(lockfile).toContain('name = "my-app-ui"');
  });
});
