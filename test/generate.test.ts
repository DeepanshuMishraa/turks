import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Command, CommandRunner } from "../src/core/command.js";
import type { StackConfig } from "../src/core/config.js";
import { generateProject } from "../src/core/generate.js";
import { Planner } from "../src/core/planner.js";
import { Result, type Result as ResultValue } from "../src/core/result.js";
import type { CommandError } from "../src/core/command.js";

class FakeCommandRunner implements CommandRunner {
  readonly commands: Command[] = [];

  async run(command: Command): Promise<ResultValue<void, CommandError>> {
    this.commands.push(command);
    if (command.executable === "cargo" && command.args[0] === "new") {
      const api = path.join(command.cwd, "apps/api");
      await mkdir(path.join(api, "src"), { recursive: true });
      await mkdir(path.join(api, ".git"));
      await writeFile(path.join(api, "Cargo.toml"), "[package]\nname = \"my-app-api\"\nversion = \"0.1.0\"\nedition = \"2024\"\n", "utf8");
      await writeFile(path.join(api, "src/main.rs"), "fn main() {}\n", "utf8");
    }
    if (command.args.includes("create-expo-app@latest")) {
      const mobile = path.join(command.cwd, "apps/mobile");
      await mkdir(mobile, { recursive: true });
      await writeFile(path.join(mobile, "package.json"), '{"name":"mobile"}\n', "utf8");
    }
    if (command.executable === "git" && command.args[0] === "init") {
      await mkdir(path.join(command.cwd, ".git"));
      await writeFile(path.join(command.cwd, ".git/generated"), "temporary git metadata\n", "utf8");
    }
    return Result.ok(undefined);
  }
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

describe("generateProject", () => {
  it("composes the primary stack into a transactional repository", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "turks-test-"));
    temporaryDirectories.push(parent);
    const destination = path.join(parent, "my-app");
    await mkdir(destination);
    const config: StackConfig = {
      projectName: "my-app",
      destination,
      clients: [{ kind: "expo" }],
      backend: { kind: "rust", framework: "axum" },
      database: { kind: "postgres", dataLayer: "sqlx" },
      packageManager: "pnpm",
      orchestrator: "moon",
      docker: true,
      githubActions: true,
      install: false,
      initializeGit: true,
    };
    const plan = Planner.create(config);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const runner = new FakeCommandRunner();
    vi.spyOn(process, "cwd").mockReturnValue(destination);
    const result = await generateProject({ config, plan: plan.value, runner });
    expect(result).toEqual({ ok: true, value: destination });

    await expect(readFile(path.join(destination, "pnpm-workspace.yaml"), "utf8")).resolves.toContain("apps/*");
    await expect(readFile(path.join(destination, "Cargo.toml"), "utf8")).resolves.toContain('members = ["apps/api"]');
    await expect(readFile(path.join(destination, "apps/api/src/main.rs"), "utf8")).resolves.toContain('route("/health"');
    await expect(readFile(path.join(destination, "compose.yml"), "utf8")).resolves.toContain("127.0.0.1:5432:5432");
    await expect(readFile(path.join(destination, ".moon/workspace.yml"), "utf8")).resolves.toContain("apps/*");
    await expect(readFile(path.join(destination, ".moon/toolchains.yml"), "utf8")).resolves.toContain("packageManager: pnpm");
    await expect(readFile(path.join(destination, ".github/workflows/ci.yml"), "utf8")).resolves.toContain("rust-toolchain");
    await expect(readFile(path.join(destination, "README.md"), "utf8")).resolves.toContain("Rust workspace: Cargo");
    await expect(readFile(path.join(destination, ".git/generated"), "utf8")).resolves.toContain("temporary git metadata");
    await expect(access(path.join(destination, "apps/api/.git"))).rejects.toThrow();

    expect(runner.commands.some((command) => command.args.includes("create-expo-app@latest"))).toBe(true);
    expect(runner.commands.some((command) => command.executable === "cargo" && command.args.includes("--vcs") && command.args.includes("none"))).toBe(true);
    expect(runner.commands.filter((command) => command.executable === "cargo" && command.args[0] === "add")).toHaveLength(3);
  });

  it("converts progress exceptions to errors and removes temporary output", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "turks-progress-"));
    temporaryDirectories.push(parent);
    const destination = path.join(parent, "my-app");
    const config: StackConfig = {
      projectName: "my-app",
      destination,
      clients: [{ kind: "expo" }],
      backend: { kind: "none" },
      database: { kind: "none" },
      packageManager: "pnpm",
      orchestrator: "none",
      docker: false,
      githubActions: false,
      install: false,
      initializeGit: false,
    };
    const plan = Planner.create(config);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const result = await generateProject({
      config,
      plan: plan.value,
      runner: new FakeCommandRunner(),
      onProgress() { throw new Error("progress failed"); },
    });

    expect(result.ok).toBe(false);
    await expect(access(destination)).rejects.toThrow();
    expect(await readdir(parent)).toEqual([]);
  });

  it("merges into an existing directory only when explicitly allowed", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "turks-merge-"));
    temporaryDirectories.push(parent);
    const destination = path.join(parent, "existing-app");
    await mkdir(path.join(destination, "apps/api"), { recursive: true });
    await mkdir(path.join(destination, ".git"));
    await writeFile(path.join(destination, "README.md"), "old readme\n", "utf8");
    await writeFile(path.join(destination, "notes.txt"), "preserve me\n", "utf8");
    await writeFile(path.join(destination, "apps/api/keep.txt"), "keep nested\n", "utf8");
    await writeFile(path.join(destination, ".git/keep"), "keep git\n", "utf8");
    const config: StackConfig = {
      projectName: "existing-app",
      destination,
      clients: [],
      backend: { kind: "typescript", framework: "hono" },
      database: { kind: "none" },
      packageManager: "pnpm",
      orchestrator: "none",
      docker: false,
      githubActions: false,
      install: false,
      initializeGit: true,
    };
    const plan = Planner.create(config);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const rejected = await generateProject({ config, plan: plan.value, runner: new FakeCommandRunner() });
    expect(rejected.ok).toBe(false);
    await expect(readFile(path.join(destination, "README.md"), "utf8")).resolves.toBe("old readme\n");

    const merged = await generateProject({ config, plan: plan.value, runner: new FakeCommandRunner(), mergeIntoExisting: true });
    expect(merged).toEqual({ ok: true, value: destination });
    await expect(readFile(path.join(destination, "README.md"), "utf8")).resolves.toContain("Generated by");
    await expect(readFile(path.join(destination, "notes.txt"), "utf8")).resolves.toBe("preserve me\n");
    await expect(readFile(path.join(destination, "apps/api/keep.txt"), "utf8")).resolves.toBe("keep nested\n");
    await expect(readFile(path.join(destination, ".git/keep"), "utf8")).resolves.toBe("keep git\n");
    await expect(access(path.join(destination, ".git/generated"))).rejects.toThrow();
    await expect(readFile(path.join(destination, "apps/api/package.json"), "utf8")).resolves.toContain("@existing-app/api");
  });
});
