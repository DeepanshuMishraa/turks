import type { Generator } from "../core/generator.js";
import { PackageManager } from "../core/package-manager.js";
import { Result } from "../core/result.js";
import { generationFailure, runGeneratorCommand, writeProjectFile, writeProjectJson } from "./shared.js";

function rootScripts(config: Parameters<Generator["generate"]>[0]["config"]): Record<string, string> {
  const devCommands: string[] = [];
  const buildCommands: string[] = [];

  for (const client of config.clients) {
    switch (client.kind) {
      case "expo": case "react-native":
        devCommands.push(PackageManager.runWorkspaceScript(config.packageManager, `./apps/${client.kind === "expo" ? "mobile" : client.kind}`, "start"));
        break;
      case "next": case "react-vite": case "vue-vite": case "sveltekit": case "astro": {
        const directory = client.kind === "react-vite" ? "react" : client.kind === "vue-vite" ? "vue" : client.kind;
        devCommands.push(PackageManager.runWorkspaceScript(config.packageManager, `./apps/${directory}`, "dev"));
        buildCommands.push(PackageManager.runWorkspaceScript(config.packageManager, `./apps/${directory}`, "build"));
        break;
      }
      case "tauri":
        devCommands.push(PackageManager.runWorkspaceScript(config.packageManager, "./apps/tauri", "tauri", ["dev"]));
        buildCommands.push(PackageManager.runWorkspaceScript(config.packageManager, "./apps/tauri", "tauri", ["build"]));
        break;
      case "electron":
        devCommands.push(PackageManager.runWorkspaceScript(config.packageManager, "./apps/electron", "start"));
        buildCommands.push(PackageManager.runWorkspaceScript(config.packageManager, "./apps/electron", "package"));
        break;
    }
  }
  if (config.backend.kind === "rust") {
    devCommands.push("cargo run --manifest-path apps/api/Cargo.toml");
    buildCommands.push("cargo build --workspace");
  }
  if (config.backend.kind === "go") {
    devCommands.push("go -C apps/api run .");
    buildCommands.push("go -C apps/api build .");
  }
  if (config.backend.kind === "typescript") {
    devCommands.push(PackageManager.runWorkspaceScript(config.packageManager, "./apps/api", "dev"));
    buildCommands.push(PackageManager.runWorkspaceScript(config.packageManager, "./apps/api", "build"));
  }
  if (config.backend.kind === "python") {
    const command = config.backend.framework === "none"
      ? "uv run --directory apps/api python main.py"
      : config.backend.framework === "django"
      ? "uv run --directory apps/api python manage.py runserver 3000"
      : config.backend.framework === "flask"
        ? "uv run --directory apps/api flask --app main run --port 3000"
        : config.backend.framework === "litestar"
          ? "uv run --directory apps/api litestar run --host 0.0.0.0 --port 3000"
          : "uv run --directory apps/api fastapi dev main.py --port 3000";
    devCommands.push(command);
    buildCommands.push("uv sync --directory apps/api");
  }

  const firstDevCommand = devCommands[0];
  const dev = firstDevCommand === undefined
    ? "echo 'Nothing to run'"
    : devCommands.length === 1
      ? firstDevCommand
      : `concurrently --kill-others-on-fail ${devCommands.map((command) => JSON.stringify(command)).join(" ")}`;

  return {
    dev,
    build: buildCommands.length > 0 ? buildCommands.join(" && ") : "echo 'Nothing to build'",
  };
}

function allowedBuildDependencies(config: Parameters<Generator["generate"]>[0]["config"]): readonly string[] {
  return [
    ...(config.clients.some((client) => client.kind === "electron") ? ["electron"] : []),
    ...(config.backend.kind === "typescript" || config.clients.some((client) => ["react-vite", "vue-vite", "sveltekit", "astro", "tauri"].includes(client.kind)) ? ["esbuild"] : []),
    ...(config.database.kind === "sqlite" && config.backend.kind === "typescript" ? ["better-sqlite3"] : []),
  ];
}

export const rootGenerator: Generator = {
  id: "root",
  label: "Root workspace",
  dependencies: [],
  async generate(context) {
    try {
      const packageManagerSettings = context.config.packageManager === "bun"
        ? { trustedDependencies: allowedBuildDependencies(context.config) }
        : {};
      await writeProjectJson(context, "package.json", {
        name: context.config.projectName,
        private: true,
        workspaces: ["apps/*", "packages/*"],
        scripts: rootScripts(context.config),
        devDependencies: { concurrently: "^9.2.0" },
        packageManager: PackageManager.manifestValue(context.config.packageManager),
        ...packageManagerSettings,
      });
      await writeProjectFile(context, ".gitignore", "node_modules/\ntarget/\n.env\n.env.local\n.DS_Store\n");
      await writeProjectFile(context, ".env.example", "# Add project environment variables here.\n");
      await writeProjectFile(context, "apps/.gitkeep", "");
      await writeProjectFile(context, "packages/.gitkeep", "");
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("root", error);
    }
  },
};

export const packageManagerGenerator: Generator = {
  id: "package-manager",
  label: "JavaScript workspace",
  dependencies: ["root"],
  async generate(context) {
    try {
      if (context.config.packageManager === "pnpm") {
        const dependencies = allowedBuildDependencies(context.config);
        const allowedBuilds = dependencies.length === 0
          ? ""
          : `allowBuilds:\n${dependencies.map((dependency) => `  '${dependency}': true`).join("\n")}\n`;
        await writeProjectFile(context, "pnpm-workspace.yaml", `packages:\n  - 'apps/*'\n  - 'packages/*'\n${allowedBuilds}`);
      }
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("package-manager", error);
    }
  },
};

export const cargoGenerator: Generator = {
  id: "cargo",
  label: "Cargo workspace",
  dependencies: ["root"],
  async generate(context) {
    try {
      const members: string[] = [];
      if (context.config.backend.kind === "rust") members.push("apps/api");
      if (context.config.clients.some((client) => client.kind === "tauri")) members.push("apps/tauri/src-tauri");
      await writeProjectFile(context, "Cargo.toml", `[workspace]\nmembers = [${members.map((member) => `"${member}"`).join(", ")}]\nresolver = "2"\n`);
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("cargo", error);
    }
  },
};

export const installGenerator: Generator = {
  id: "install",
  label: "Dependencies",
  dependencies: ["readme"],
  async generate(context) {
    return await runGeneratorCommand(context, "install", PackageManager.installCommand(context.config.packageManager));
  },
};

export const gitGenerator: Generator = {
  id: "git",
  label: "Git repository",
  dependencies: ["readme"],
  async generate(context) {
    return await runGeneratorCommand(context, "git", {
      executable: "git",
      args: ["init", "--quiet"],
    });
  },
};
