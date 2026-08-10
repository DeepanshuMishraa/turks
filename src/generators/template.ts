import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "../core/command.js";
import type { Generator } from "../core/generator.js";
import { Result } from "../core/result.js";
import type { StackConfig } from "../core/config.js";
import type { TemplateKind } from "../core/support.js";
import { generationFailure, runGeneratorCommand } from "./shared.js";

export type Template = {
  readonly id: Exclude<TemplateKind, "none">;
  readonly label: string;
  readonly description: string;
  readonly directory: string;
  readonly install: Pick<Command, "executable" | "args">;
};

const TEMPLATES: Readonly<Record<Exclude<TemplateKind, "none">, Template>> = {
  "gpui-starter": {
    id: "gpui-starter",
    label: "GPUI desktop app",
    description: "Minimal GPUI desktop app with the Groknight theme and a clickable button.",
    directory: "gpui-starter",
    install: { executable: "cargo", args: ["build"] },
  },
};

export function kebabName(projectName: string): string {
  return projectName.replace(/[._-]+/g, "-");
}

export function snakeName(projectName: string): string {
  return projectName.replace(/[._-]+/g, "_");
}

export function humanName(projectName: string): string {
  return projectName
    .split(/[^a-z0-9]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function rewritten(contents: string, names: { readonly kebab: string; readonly snake: string; readonly human: string }): string {
  return contents
    .replaceAll("gpui-starter", names.kebab)
    .replaceAll("gpui_starter", names.snake)
    .replaceAll("GPUI Starter", names.human);
}

const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2", ".ttf", ".otf", ".eot"]);

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await lstat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function copyTemplate(source: string, destination: string, names: { readonly kebab: string; readonly snake: string; readonly human: string }): Promise<void> {
  for (const entry of await readdir(source)) {
    if (entry === ".git") continue;
    const sourcePath = path.join(source, entry);
    const destinationPath = path.join(destination, entry);
    if (await isDirectory(sourcePath)) {
      await mkdir(destinationPath, { recursive: true });
      await copyTemplate(sourcePath, destinationPath, names);
      continue;
    }
    await mkdir(path.dirname(destinationPath), { recursive: true });
    if (BINARY_EXTENSIONS.has(path.extname(entry).toLowerCase())) {
      await copyFile(sourcePath, destinationPath);
    } else {
      const contents = await readFile(sourcePath, "utf8");
      await writeFile(destinationPath, rewritten(contents, names), "utf8");
    }
  }
}

let templatesRootPromise: Promise<string | undefined> | undefined;

declare const __dirname: string | undefined;

function moduleDirectory(): string {
  return typeof __dirname === "string" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
}

async function templatesRoot(): Promise<string | undefined> {
  if (templatesRootPromise === undefined) {
    templatesRootPromise = (async () => {
      let current = moduleDirectory();
      for (let depth = 0; depth < 8; depth += 1) {
        const candidate = path.join(current, "templates");
        if (await isDirectory(candidate)) return candidate;
        const parent = path.dirname(current);
        if (parent === current) return undefined;
        current = parent;
      }
      return undefined;
    })();
  }
  return await templatesRootPromise;
}

export const Templates = {
  info(id: TemplateKind): Template | undefined {
    return id === "none" ? undefined : TEMPLATES[id];
  },

  build(config: Pick<StackConfig, "template">): string | undefined {
    const info = config.template === "none" ? undefined : TEMPLATES[config.template];
    return info === undefined ? undefined : [info.install.executable, ...info.install.args].join(" ");
  },

  run(config: Pick<StackConfig, "template" | "projectName">): string | undefined {
    if (config.template === "none") return undefined;
    switch (config.template) {
      case "gpui-starter":
        return `cargo run -p ${kebabName(config.projectName)}-desktop`;
    }
  },
} as const;

export const templateGenerator: Generator = {
  id: "template",
  label: "Template scaffold",
  dependencies: [],
  async generate(context) {
    const info = Templates.info(context.config.template);
    if (info === undefined) {
      return Result.error({
        code: "generation-failed",
        generator: "template",
        message: `No template is available for '${context.config.template}'.`,
        recovery: "Report this as a turks bug.",
      });
    }
    const root = await templatesRoot();
    if (root === undefined) {
      return Result.error({
        code: "generation-failed",
        generator: "template",
        message: "Could not locate the bundled template files.",
        recovery: "Reinstall turks, then rerun. The incomplete project was not kept.",
      });
    }
    try {
      const names = {
        kebab: kebabName(context.config.projectName),
        snake: snakeName(context.config.projectName),
        human: humanName(context.config.projectName),
      };
      await copyTemplate(path.join(root, info.directory), context.rootDir, names);
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("template", error);
    }
  },
};

export const templateInstallGenerator: Generator = {
  id: "template-install",
  label: "Build dependencies",
  dependencies: ["template"],
  async generate(context) {
    const info = Templates.info(context.config.template);
    if (info === undefined) {
      return Result.error({
        code: "generation-failed",
        generator: "template-install",
        message: `No template is available for '${context.config.template}'.`,
        recovery: "Report this as a turks bug.",
      });
    }
    return await runGeneratorCommand(context, "template-install", info.install);
  },
};