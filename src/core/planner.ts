import type { StackConfig } from "./config.js";
import type { GenerationError, Generator, GeneratorId } from "./generator.js";
import { Result, type Result as ResultValue } from "./result.js";
import { GeneratorRegistry } from "../generators/registry.js";

export type GenerationPlan = {
  readonly generators: readonly Generator[];
};

function selectedGeneratorIds(config: StackConfig): readonly GeneratorId[] {
  const ids: GeneratorId[] = ["root", "pnpm"];

  for (const client of config.clients) ids.push(client.kind);

  switch (config.backend.kind) {
    case "none":
      break;
    case "rust":
      ids.push("rust");
      if (config.backend.framework !== "none") ids.push(config.backend.framework);
      ids.push("cargo");
      break;
    case "go":
      ids.push("go");
      if (config.backend.framework !== "none") ids.push(config.backend.framework);
      break;
    case "typescript":
      ids.push("typescript");
      if (config.backend.framework !== "none") ids.push(config.backend.framework);
      break;
    case "python":
      ids.push("python");
      if (config.backend.framework !== "none") ids.push(config.backend.framework);
      break;
  }

  if (config.clients.some((client) => client.kind === "tauri") && config.backend.kind !== "rust") ids.push("cargo");

  if (config.database.kind !== "none") {
    ids.push(config.database.kind);
    if (config.database.dataLayer !== "none") ids.push(config.database.dataLayer);
  }

  if (config.orchestrator === "moon") ids.push("moon");
  if (config.docker) ids.push("docker");
  if (config.githubActions) ids.push("github-actions");
  ids.push("readme");
  if (config.install) ids.push("install");
  if (config.initializeGit) ids.push("git");
  return ids;
}

export const Planner = {
  create(config: StackConfig): ResultValue<GenerationPlan, GenerationError> {
    const ordered: Generator[] = [];
    const visited = new Set<GeneratorId>();
    const visiting = new Set<GeneratorId>();

    const visit = (id: GeneratorId): ResultValue<void, GenerationError> => {
      if (visited.has(id)) return Result.ok(undefined);
      if (visiting.has(id)) {
        return Result.error({
          code: "invalid-plan",
          generator: id,
          message: `Generator dependency cycle detected at '${id}'.`,
          recovery: "Report this as a turks bug.",
        });
      }

      const generator = GeneratorRegistry.get(id);
      if (generator === undefined) {
        return Result.error({
          code: "invalid-plan",
          generator: id,
          message: `No generator is registered for '${id}'.`,
          recovery: "Report this as a turks bug.",
        });
      }

      visiting.add(id);
      for (const dependency of generator.dependencies) {
        const dependencyResult = visit(dependency);
        if (!dependencyResult.ok) return dependencyResult;
      }
      visiting.delete(id);
      visited.add(id);
      ordered.push(generator);
      return Result.ok(undefined);
    };

    const selected = selectedGeneratorIds(config);
    for (const id of selected.filter((candidate) => candidate !== "install" && candidate !== "git")) {
      const result = visit(id);
      if (!result.ok) return result;
    }

    if (selected.includes("install")) {
      const result = visit("install");
      if (!result.ok) return result;
    }
    if (selected.includes("git")) {
      const result = visit("git");
      if (!result.ok) return result;
    }

    return Result.ok({ generators: ordered });
  },
} as const;
