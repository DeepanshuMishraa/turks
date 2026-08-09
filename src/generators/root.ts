import type { Generator } from "../core/generator.js";
import { Result } from "../core/result.js";
import { generationFailure, runGeneratorCommand, writeProjectFile, writeProjectJson } from "./shared.js";

function rootScripts(config: Parameters<Generator["generate"]>[0]["config"]): Record<string, string> {
  const devCommands: string[] = [];
  const buildCommands: string[] = [];

  for (const client of config.clients) {
    switch (client.kind) {
      case "expo": case "react-native":
        devCommands.push(`pnpm --filter "./apps/${client.kind === "expo" ? "mobile" : client.kind}" start`);
        break;
      case "next": case "react-vite": case "vue-vite": case "sveltekit": case "astro": {
        const directory = client.kind === "react-vite" ? "react" : client.kind === "vue-vite" ? "vue" : client.kind;
        devCommands.push(`pnpm --filter "./apps/${directory}" dev`);
        buildCommands.push(`pnpm --filter "./apps/${directory}" build`);
        break;
      }
      case "tauri":
        devCommands.push('pnpm --filter "./apps/tauri" tauri dev');
        buildCommands.push('pnpm --filter "./apps/tauri" tauri build');
        break;
      case "electron":
        devCommands.push('pnpm --filter "./apps/electron" start');
        buildCommands.push('pnpm --filter "./apps/electron" package');
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
    devCommands.push('pnpm --filter "./apps/api" dev');
    buildCommands.push('pnpm --filter "./apps/api" build');
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

  return {
    dev: `concurrently --kill-others-on-fail ${devCommands.map((command) => JSON.stringify(command)).join(" ")}`,
    build: buildCommands.length > 0 ? buildCommands.join(" && ") : "echo 'Nothing to build'",
  };
}

export const rootGenerator: Generator = {
  id: "root",
  label: "Root workspace",
  dependencies: [],
  async generate(context) {
    try {
      const allowedBuildDependencies = [
        ...(context.config.clients.some((client) => client.kind === "electron") ? ["electron"] : []),
        ...(context.config.clients.some((client) => ["react-vite", "vue-vite", "sveltekit", "astro", "tauri"].includes(client.kind)) ? ["esbuild"] : []),
        ...(context.config.database.kind === "sqlite" && context.config.backend.kind === "typescript" ? ["better-sqlite3"] : []),
      ];
      await writeProjectJson(context, "package.json", {
        name: context.config.projectName,
        private: true,
        scripts: rootScripts(context.config),
        devDependencies: { concurrently: "^9.2.0" },
        packageManager: "pnpm@10.15.0",
        pnpm: { onlyBuiltDependencies: allowedBuildDependencies },
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

export const pnpmGenerator: Generator = {
  id: "pnpm",
  label: "pnpm workspace",
  dependencies: ["root"],
  async generate(context) {
    try {
      await writeProjectFile(context, "pnpm-workspace.yaml", "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("pnpm", error);
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
    return await runGeneratorCommand(context, "install", {
      executable: "pnpm",
      args: ["install"],
    });
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
