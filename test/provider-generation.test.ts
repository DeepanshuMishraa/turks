import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Command, CommandError, CommandRunner } from "../src/core/command.js";
import type { BackendSelection, ClientSelection, StackConfig } from "../src/core/config.js";
import { StackConfig as StackConfigModule } from "../src/core/config.js";
import { generateProject } from "../src/core/generate.js";
import { Planner } from "../src/core/planner.js";
import { Result, type Result as ResultValue } from "../src/core/result.js";
import type { PackageManager } from "../src/core/package-manager.js";
import { DATA_LAYERS, DATA_LAYER_SUPPORT, type DataLayerKind } from "../src/core/support.js";

class MatrixCommandRunner implements CommandRunner {
  readonly commands: Command[] = [];

  async run(command: Command): Promise<ResultValue<void, CommandError>> {
    this.commands.push(command);
    if (command.executable === "cargo" && command.args[0] === "new") {
      const api = path.join(command.cwd, "apps/api");
      await mkdir(path.join(api, "src"), { recursive: true });
      await writeFile(path.join(api, "Cargo.toml"), "[package]\nname = \"matrix-api\"\nversion = \"0.1.0\"\nedition = \"2024\"\n", "utf8");
      await writeFile(path.join(api, "src/main.rs"), "fn main() {}\n", "utf8");
    }
    return Result.ok(undefined);
  }
}

const backendSelections: readonly Exclude<BackendSelection, { readonly kind: "none" }>[] = [
  { kind: "rust", framework: "none" }, { kind: "rust", framework: "axum" }, { kind: "rust", framework: "actix-web" }, { kind: "rust", framework: "rocket" },
  { kind: "go", framework: "none" }, { kind: "go", framework: "stdlib" }, { kind: "go", framework: "chi" }, { kind: "go", framework: "gin" }, { kind: "go", framework: "fiber" }, { kind: "go", framework: "echo" },
  { kind: "typescript", framework: "none" }, { kind: "typescript", framework: "hono" }, { kind: "typescript", framework: "express" }, { kind: "typescript", framework: "fastify" }, { kind: "typescript", framework: "nest" },
  { kind: "python", framework: "none" }, { kind: "python", framework: "fastapi" }, { kind: "python", framework: "django" }, { kind: "python", framework: "flask" }, { kind: "python", framework: "litestar" },
];

const clientSelections: readonly ClientSelection[] = [
  { kind: "expo" }, { kind: "next" }, { kind: "react-vite" }, { kind: "vue-vite" }, { kind: "sveltekit" }, { kind: "astro" }, { kind: "react-native" }, { kind: "tauri" }, { kind: "electron" },
];

function backendFor(dataLayer: Exclude<DataLayerKind, "none">): Exclude<BackendSelection, { readonly kind: "none" }> {
  const language = DATA_LAYER_SUPPORT[dataLayer].languages[0];
  switch (language) {
    case "rust": return { kind: "rust", framework: "axum" };
    case "go": return { kind: "go", framework: "chi" };
    case "typescript": return { kind: "typescript", framework: "hono" };
    case "python": return { kind: "python", framework: dataLayer === "django-orm" ? "django" : "fastapi" };
    case undefined: return { kind: "rust", framework: "none" };
  }
  return { kind: "rust", framework: "none" };
}

let parent: string;

beforeAll(async () => {
  parent = await mkdtemp(path.join(os.tmpdir(), "turks-matrix-"));
});

afterAll(async () => {
  await rm(parent, { recursive: true, force: true });
});

async function generate(
  name: string,
  backend: BackendSelection,
  database: StackConfig["database"],
  clients: readonly ClientSelection[] = [],
  runner: CommandRunner = new MatrixCommandRunner(),
  packageManager: PackageManager = "pnpm",
  install = false,
): Promise<boolean> {
  const candidate: StackConfig = {
    projectName: name,
    destination: path.join(parent, name),
    clients,
    backend,
    database,
    packageManager,
    orchestrator: "none",
    docker: false,
    githubActions: false,
    install,
    initializeGit: false,
  };
  const config = StackConfigModule.create(candidate);
  if (!config.ok) return false;
  const plan = Planner.create(config.value);
  if (!plan.ok) return false;
  return (await generateProject({ config: config.value, plan: plan.value, runner })).ok;
}

describe("provider generation", () => {
  it("generates and installs TypeScript workspaces with the selected package manager", async () => {
    for (const packageManager of ["npm", "pnpm", "bun"] as const) {
      const runner = new MatrixCommandRunner();
      const name = `typescript-${packageManager}`;
      expect(await generate(name, { kind: "typescript", framework: "hono" }, { kind: "none" }, [], runner, packageManager, true)).toBe(true);

      const rootPackage = await readFile(path.join(parent, name, "package.json"), "utf8");
      expect(rootPackage).toContain(`"packageManager": "${packageManager}@`);
      expect(rootPackage).toContain('"workspaces": [');
      expect(runner.commands.some((command) => command.executable === packageManager && command.args.length === 1 && command.args[0] === "install")).toBe(true);
      const workspaceFile = access(path.join(parent, name, "pnpm-workspace.yaml"));
      if (packageManager === "pnpm") {
        await expect(readFile(path.join(parent, name, "pnpm-workspace.yaml"), "utf8")).resolves.toContain("'esbuild': true");
      } else {
        await expect(workspaceFile).rejects.toThrow();
      }
      if (packageManager === "bun") expect(rootPackage).toContain('"trustedDependencies"');
    }

    expect(await generate("typescript-no-install", { kind: "typescript", framework: "hono" }, { kind: "none" }, [], new MatrixCommandRunner(), "npm", false)).toBe(true);
    await expect(readFile(path.join(parent, "typescript-no-install/README.md"), "utf8")).resolves.toContain("npm install");
  });

  it("scaffolds clients with the selected package manager", async () => {
    const runner = new MatrixCommandRunner();
    expect(await generate("next-bun", { kind: "none" }, { kind: "none" }, [{ kind: "next" }], runner, "bun")).toBe(true);
    expect(runner.commands.some((command) => command.executable === "bunx" && command.args.includes("create-next-app@latest") && command.args.includes("--use-bun"))).toBe(true);
  });

  it("generates every client independently and together", async () => {
    for (const [index, client] of clientSelections.entries()) {
      expect(await generate(`client-${index}`, { kind: "none" }, { kind: "none" }, [client]), client.kind).toBe(true);
    }
    expect(await generate("clients-combined", { kind: "none" }, { kind: "none" }, clientSelections)).toBe(true);
  });

  it("prevents Electron from creating a nested Git repository", async () => {
    const runner = new MatrixCommandRunner();
    expect(await generate("electron-git", { kind: "none" }, { kind: "none" }, [{ kind: "electron" }], runner)).toBe(true);
    expect(runner.commands.some((command) => command.args.includes("create-electron-app@latest") && command.args.includes("--skip-git"))).toBe(true);
  });

  it("leaves Expo installation to the root install generator", async () => {
    const runner = new MatrixCommandRunner();
    expect(await generate("expo-install", { kind: "none" }, { kind: "none" }, [{ kind: "expo" }], runner)).toBe(true);
    expect(runner.commands.some((command) => command.args.includes("create-expo-app@latest") && command.args.includes("--no-install"))).toBe(true);
  });

  it("writes safe package identifiers and scoped decorator settings", async () => {
    const rustRunner = new MatrixCommandRunner();
    expect(await generate("rust.safe-name", { kind: "rust", framework: "none" }, { kind: "none" }, [], rustRunner)).toBe(true);
    expect(rustRunner.commands.some((command) => command.args.includes("rust-safe-name-api"))).toBe(true);

    expect(await generate("hono.safe-name", { kind: "typescript", framework: "hono" }, { kind: "none" })).toBe(true);
    const honoPackage = await readFile(path.join(parent, "hono.safe-name/apps/api/package.json"), "utf8");
    const honoRootPackage = await readFile(path.join(parent, "hono.safe-name/package.json"), "utf8");
    const honoTsconfig = await readFile(path.join(parent, "hono.safe-name/apps/api/tsconfig.json"), "utf8");
    expect(honoPackage).toContain('"name": "@hono-safe-name/api"');
    expect(honoRootPackage).toContain('"dev": "pnpm --filter \\"./apps/api\\" dev"');
    expect(honoTsconfig).not.toContain("experimentalDecorators");

    expect(await generate("nest-safe", { kind: "typescript", framework: "nest" }, { kind: "none" })).toBe(true);
    const nestTsconfig = await readFile(path.join(parent, "nest-safe/apps/api/tsconfig.json"), "utf8");
    expect(nestTsconfig).toContain('"experimentalDecorators": true');

    expect(await generate("typeorm-safe", { kind: "typescript", framework: "hono" }, { kind: "postgres", dataLayer: "typeorm" })).toBe(true);
    const typeormTsconfig = await readFile(path.join(parent, "typeorm-safe/apps/api/tsconfig.json"), "utf8");
    expect(typeormTsconfig).toContain('"emitDecoratorMetadata": true');
  });

  it("generates environment-driven Django development settings", async () => {
    expect(await generate("django-settings", { kind: "python", framework: "django" }, { kind: "none" })).toBe(true);
    const settings = await readFile(path.join(parent, "django-settings/apps/api/config/settings.py"), "utf8");
    expect(settings).toContain('os.getenv("SECRET_KEY", "development-only")');
    expect(settings).toContain('.lower() in {"1", "true", "yes", "on"}');
  });

  it("generates every backend framework with no database", async () => {
    for (const [index, backend] of backendSelections.entries()) {
      expect(await generate(`backend-${index}`, backend, { kind: "none" }), `${backend.kind}/${backend.framework}`).toBe(true);
    }
  });

  it("generates every declared data-layer/database binding", async () => {
    let index = 0;
    for (const dataLayer of DATA_LAYERS) {
      if (dataLayer === "none") continue;
      for (const database of DATA_LAYER_SUPPORT[dataLayer].databases) {
        expect(await generate(`data-${index}`, backendFor(dataLayer), { kind: database, dataLayer }), `${dataLayer}/${database}`).toBe(true);
        index += 1;
      }
    }
    expect(index).toBeGreaterThan(30);
  });
});
