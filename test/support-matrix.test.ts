import { describe, expect, it } from "vitest";
import type { BackendSelection, DatabaseSelection, StackConfig } from "../src/core/config.js";
import { StackConfig as StackConfigModule } from "../src/core/config.js";
import { Planner } from "../src/core/planner.js";
import { CLIENTS, DATA_LAYERS, DATA_LAYER_SUPPORT, type DataLayerKind, type DatabaseKind } from "../src/core/support.js";

const backends: readonly BackendSelection[] = [
  { kind: "none" },
  { kind: "rust", framework: "none" },
  { kind: "rust", framework: "axum" },
  { kind: "rust", framework: "actix-web" },
  { kind: "rust", framework: "rocket" },
  { kind: "go", framework: "none" },
  { kind: "go", framework: "stdlib" },
  { kind: "go", framework: "chi" },
  { kind: "go", framework: "gin" },
  { kind: "go", framework: "fiber" },
  { kind: "go", framework: "echo" },
  { kind: "typescript", framework: "none" },
  { kind: "typescript", framework: "hono" },
  { kind: "typescript", framework: "express" },
  { kind: "typescript", framework: "fastify" },
  { kind: "typescript", framework: "nest" },
  { kind: "python", framework: "none" },
  { kind: "python", framework: "fastapi" },
  { kind: "python", framework: "django" },
  { kind: "python", framework: "flask" },
  { kind: "python", framework: "litestar" },
];

const databases: readonly Exclude<DatabaseKind, "none">[] = ["postgres", "mysql", "sqlite", "mongodb"];

function expectedCompatibility(backend: BackendSelection, database: Exclude<DatabaseKind, "none">, dataLayer: DataLayerKind): boolean {
  if (dataLayer === "none") return true;
  if (backend.kind === "none") return false;
  const support = DATA_LAYER_SUPPORT[dataLayer];
  return support.languages.includes(backend.kind)
    && support.databases.includes(database)
    && (support.frameworks === undefined || support.frameworks.includes(backend.framework));
}

function config(backend: BackendSelection, database: DatabaseSelection): StackConfig {
  return {
    projectName: "matrix-app",
    destination: "/tmp/matrix-app",
    template: "none",
    clients: backend.kind === "none" ? [{ kind: "expo" }] : [],
    backend,
    database,
    packageManager: "pnpm",
    orchestrator: "none",
    docker: false,
    githubActions: false,
    install: false,
    initializeGit: false,
  };
}

describe("declared support matrix", () => {
  it("matches representative compatibility expectations", () => {
    const cases: readonly {
      readonly backend: BackendSelection;
      readonly database: DatabaseSelection;
      readonly compatible: boolean;
    }[] = [
      { backend: { kind: "rust", framework: "axum" }, database: { kind: "mongodb", dataLayer: "sqlx" }, compatible: false },
      { backend: { kind: "python", framework: "django" }, database: { kind: "postgres", dataLayer: "django-orm" }, compatible: true },
      { backend: { kind: "python", framework: "fastapi" }, database: { kind: "postgres", dataLayer: "django-orm" }, compatible: false },
      { backend: { kind: "typescript", framework: "hono" }, database: { kind: "mongodb", dataLayer: "mongoose" }, compatible: true },
    ];

    for (const candidate of cases) {
      expect(StackConfigModule.create(config(candidate.backend, candidate.database)).ok).toBe(candidate.compatible);
    }
  });

  it("plans every non-empty combination of clients", () => {
    const combinations = 2 ** CLIENTS.length;
    for (let mask = 1; mask < combinations; mask += 1) {
      const clients = CLIENTS
        .filter((_client, index) => (mask & (1 << index)) !== 0)
        .map((kind) => ({ kind }));
      const candidate: StackConfig = {
        ...config({ kind: "none" }, { kind: "none" }),
        clients,
      };
      const result = StackConfigModule.create(candidate);
      expect(result.ok).toBe(true);
      if (result.ok) expect(Planner.create(result.value).ok).toBe(true);
    }
    expect(combinations - 1).toBe(511);
  });

  it("accepts every declared valid tuple and rejects every invalid tuple", () => {
    let checked = 0;
    for (const backend of backends) {
      for (const database of databases) {
        for (const dataLayer of DATA_LAYERS) {
          const result = StackConfigModule.create(config(backend, { kind: database, dataLayer }));
          const expected = expectedCompatibility(backend, database, dataLayer);
          expect(result.ok, `${backend.kind}/${backend.kind === "none" ? "none" : backend.framework}/${database}/${dataLayer}`).toBe(expected);
          if (result.ok) expect(Planner.create(result.value).ok).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(backends.length * databases.length * DATA_LAYERS.length);
  });

  it("supports database and ORM opt-outs independently", () => {
    for (const backend of backends) {
      const noDatabase = StackConfigModule.create(config(backend, { kind: "none" }));
      expect(noDatabase.ok).toBe(true);
      for (const database of databases) {
        const noDataLayer = StackConfigModule.create(config(backend, { kind: database, dataLayer: "none" }));
        expect(noDataLayer.ok).toBe(true);
      }
    }
  });
});
