import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
      await writeFile(path.join(api, "Cargo.toml"), "[package]\nname = \"my-app-api\"\nversion = \"0.1.0\"\nedition = \"2024\"\n", "utf8");
      await writeFile(path.join(api, "src/main.rs"), "fn main() {}\n", "utf8");
    }
    if (command.executable === "pnpm" && command.args.includes("create-expo-app@latest")) {
      const mobile = path.join(command.cwd, "apps/mobile");
      await mkdir(mobile, { recursive: true });
      await writeFile(path.join(mobile, "package.json"), '{"name":"mobile"}\n', "utf8");
    }
    return Result.ok(undefined);
  }
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
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
      initializeGit: false,
    };
    const plan = Planner.create(config);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const runner = new FakeCommandRunner();
    const result = await generateProject({ config, plan: plan.value, runner });
    expect(result).toEqual({ ok: true, value: destination });

    await expect(readFile(path.join(destination, "pnpm-workspace.yaml"), "utf8")).resolves.toContain("apps/*");
    await expect(readFile(path.join(destination, "Cargo.toml"), "utf8")).resolves.toContain('members = ["apps/api"]');
    await expect(readFile(path.join(destination, "apps/api/src/main.rs"), "utf8")).resolves.toContain('route("/health"');
    await expect(readFile(path.join(destination, "compose.yml"), "utf8")).resolves.toContain("postgres:17-alpine");
    await expect(readFile(path.join(destination, ".moon/workspace.yml"), "utf8")).resolves.toContain("apps/*");
    await expect(readFile(path.join(destination, ".moon/toolchains.yml"), "utf8")).resolves.toContain("packageManager: pnpm");
    await expect(readFile(path.join(destination, ".github/workflows/ci.yml"), "utf8")).resolves.toContain("rust-toolchain");
    await expect(readFile(path.join(destination, "README.md"), "utf8")).resolves.toContain("Rust workspace: Cargo");

    expect(runner.commands.some((command) => command.args.includes("create-expo-app@latest"))).toBe(true);
    expect(runner.commands.filter((command) => command.executable === "cargo" && command.args[0] === "add")).toHaveLength(3);
  });
});
