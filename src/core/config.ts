import path from "node:path";
import { Result, type Result as ResultValue } from "./result.js";
import { DATA_LAYER_SUPPORT, type DataLayerKind, type DatabaseKind, type GoFramework, type PythonFramework, type RustFramework, type TypeScriptFramework } from "./support.js";
import type { PackageManager } from "./package-manager.js";

export type ClientSelection =
  | { readonly kind: "expo" }
  | { readonly kind: "next" }
  | { readonly kind: "react-vite" }
  | { readonly kind: "vue-vite" }
  | { readonly kind: "sveltekit" }
  | { readonly kind: "astro" }
  | { readonly kind: "react-native" }
  | { readonly kind: "tauri" }
  | { readonly kind: "electron" };

export type BackendSelection =
  | { readonly kind: "none" }
  | { readonly kind: "rust"; readonly framework: RustFramework }
  | { readonly kind: "go"; readonly framework: GoFramework }
  | { readonly kind: "typescript"; readonly framework: TypeScriptFramework }
  | { readonly kind: "python"; readonly framework: PythonFramework };

export type DatabaseSelection =
  | { readonly kind: "none" }
  | {
      readonly kind: Exclude<DatabaseKind, "none">;
      readonly dataLayer: DataLayerKind;
    };

export type StackConfig = {
  readonly projectName: string;
  readonly destination: string;
  readonly clients: readonly ClientSelection[];
  readonly backend: BackendSelection;
  readonly database: DatabaseSelection;
  readonly packageManager: PackageManager;
  readonly orchestrator: "none" | "moon";
  readonly docker: boolean;
  readonly githubActions: boolean;
  readonly install: boolean;
  readonly initializeGit: boolean;
};

export type ConfigIssue = {
  readonly code:
    | "invalid-project-name"
    | "empty-stack"
    | "data-layer-requires-backend"
    | "incompatible-data-layer"
    | "docker-database-unsupported";
  readonly message: string;
  readonly recovery: string;
};

const PROJECT_NAME = /^[a-z0-9][a-z0-9._-]*$/;

export const StackConfig = {
  create(input: StackConfig): ResultValue<StackConfig, readonly ConfigIssue[]> {
    const issues: ConfigIssue[] = [];

    if (!PROJECT_NAME.test(input.projectName)) {
      issues.push({
        code: "invalid-project-name",
        message: `Project name '${input.projectName}' is invalid.`,
        recovery: "Use lowercase letters, numbers, dots, hyphens, or underscores.",
      });
    }

    if (input.clients.length === 0 && input.backend.kind === "none") {
      issues.push({
        code: "empty-stack",
        message: "The selected stack has no client or backend.",
        recovery: "Select at least one client or backend.",
      });
    }

    if (input.database.kind !== "none" && input.database.dataLayer !== "none" && input.backend.kind === "none") {
      issues.push({
        code: "data-layer-requires-backend",
        message: `${input.database.dataLayer} requires a backend language.`,
        recovery: "Select a backend or choose no data layer.",
      });
    }

    if (input.database.kind !== "none" && input.database.dataLayer !== "none" && input.backend.kind !== "none") {
      const support = DATA_LAYER_SUPPORT[input.database.dataLayer];
      const languageMatches = support.languages.includes(input.backend.kind);
      const databaseMatches = support.databases.includes(input.database.kind);
      const frameworkMatches = support.frameworks === undefined || support.frameworks.includes(input.backend.framework);
      if (!languageMatches || !databaseMatches || !frameworkMatches) {
        issues.push({
          code: "incompatible-data-layer",
          message: `${support.label} is not compatible with ${input.backend.kind} + ${input.backend.framework} + ${input.database.kind}.`,
          recovery: "Choose one of the compatible data layers shown by the interactive prompt, or select none.",
        });
      }
    }

    if ((input.database.kind === "none" || input.database.kind === "sqlite") && input.docker) {
      issues.push({
        code: "docker-database-unsupported",
        message: `Docker Compose has no service to add for database '${input.database.kind}'.`,
        recovery: "Select PostgreSQL, MySQL, or MongoDB, or disable Docker Compose.",
      });
    }

    return issues.length === 0 ? Result.ok(input) : Result.error(issues);
  },

  destination(cwd: string, projectName: string): string {
    return path.resolve(cwd, projectName);
  },
} as const;
