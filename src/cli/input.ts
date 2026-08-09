import path from "node:path";
import * as p from "@clack/prompts";
import type { BackendSelection, ClientSelection, ConfigIssue, DatabaseSelection, StackConfig } from "../core/config.js";
import { StackConfig as StackConfigModule } from "../core/config.js";
import { Result, type Result as ResultValue } from "../core/result.js";
import { BACKEND_FRAMEWORKS, CLIENTS, DATA_LAYERS, DATA_LAYER_SUPPORT, DATABASES, SUPPORT_LABELS, type BackendLanguage, type ClientKind, type DataLayerKind, type DatabaseKind } from "../core/support.js";

export type CliOptions = {
  readonly client?: string;
  readonly mobile?: string;
  readonly backend?: string;
  readonly framework?: string;
  readonly rustFramework?: string;
  readonly goFramework?: string;
  readonly typescriptFramework?: string;
  readonly pythonFramework?: string;
  readonly database?: string;
  readonly dataLayer?: string;
  readonly dbClient?: string;
  readonly orchestrator?: string;
  readonly packageManager?: string;
  readonly preset?: string;
  readonly ci?: string | boolean;
  readonly moon?: boolean;
  readonly docker?: boolean;
  readonly install: boolean;
  readonly git?: boolean;
  readonly yes?: boolean;
  readonly dryRun?: boolean;
};

export type InputError = { readonly message: string; readonly recovery: string };

type ResolvedInput = {
  readonly projectName?: string;
  readonly clients?: readonly ClientSelection[];
  readonly backend?: BackendSelection;
  readonly database?: DatabaseSelection;
  readonly orchestrator?: "none" | "moon";
  readonly docker?: boolean;
  readonly githubActions?: boolean;
};

function invalid(option: string, value: string, expected: readonly string[]): ResultValue<never, InputError> {
  return Result.error({
    message: `Invalid ${option} value '${value}'.`,
    recovery: `Use one of: ${expected.join(", ")}. Run turks --help for all options.`,
  });
}

function parseClientKind(value: string): ResultValue<ClientKind, InputError> {
  switch (value) {
    case "expo": case "next": case "react-vite": case "vue-vite": case "sveltekit": case "astro": case "react-native": case "tauri": case "electron": return Result.ok(value);
    default: return invalid("client", value, [...CLIENTS, "none"]);
  }
}

function parseClients(value: string): ResultValue<readonly ClientSelection[], InputError> {
  if (value === "none") return Result.ok([]);
  const selections: ClientSelection[] = [];
  for (const item of value.split(",").map((part) => part.trim()).filter((part) => part.length > 0)) {
    const kind = parseClientKind(item);
    if (!kind.ok) return kind;
    if (!selections.some((selection) => selection.kind === kind.value)) selections.push({ kind: kind.value });
  }
  return selections.length === 0 ? invalid("client", value, [...CLIENTS, "none"]) : Result.ok(selections);
}

function parseBackendLanguage(value: string): ResultValue<BackendLanguage | "none", InputError> {
  switch (value) {
    case "none": case "rust": case "go": case "typescript": case "python": return Result.ok(value);
    default: return invalid("backend", value, ["rust", "go", "typescript", "python", "none"]);
  }
}

function parseBackend(languageValue: string, frameworkValue: string | undefined): ResultValue<BackendSelection, InputError> {
  const language = parseBackendLanguage(languageValue);
  if (!language.ok) return language;
  if (language.value === "none") {
    return frameworkValue === undefined || frameworkValue === "none"
      ? Result.ok({ kind: "none" })
      : invalid("framework", frameworkValue, ["none"]);
  }

  const framework = frameworkValue ?? BACKEND_FRAMEWORKS[language.value][1] ?? "none";
  switch (language.value) {
    case "rust":
      switch (framework) {
        case "none": case "axum": case "actix-web": case "rocket": return Result.ok({ kind: "rust", framework });
        default: return invalid("Rust framework", framework, BACKEND_FRAMEWORKS.rust);
      }
    case "go":
      switch (framework) {
        case "none": case "stdlib": case "chi": case "gin": case "fiber": case "echo": return Result.ok({ kind: "go", framework });
        default: return invalid("Go framework", framework, BACKEND_FRAMEWORKS.go);
      }
    case "typescript":
      switch (framework) {
        case "none": case "hono": case "express": case "fastify": case "nest": return Result.ok({ kind: "typescript", framework });
        default: return invalid("TypeScript framework", framework, BACKEND_FRAMEWORKS.typescript);
      }
    case "python":
      switch (framework) {
        case "none": case "fastapi": case "django": case "flask": case "litestar": return Result.ok({ kind: "python", framework });
        default: return invalid("Python framework", framework, BACKEND_FRAMEWORKS.python);
      }
  }
}

function parseDatabaseKind(value: string): ResultValue<DatabaseKind, InputError> {
  switch (value) {
    case "none": case "postgres": case "mysql": case "sqlite": case "mongodb": return Result.ok(value);
    default: return invalid("database", value, DATABASES);
  }
}

function parseDataLayer(value: string): ResultValue<DataLayerKind, InputError> {
  switch (value) {
    case "none": case "sqlx": case "seaorm": case "diesel": case "gorm": case "ent": case "bun": case "drizzle": case "prisma": case "typeorm": case "kysely": case "mongoose": case "sqlalchemy": case "django-orm": case "tortoise": case "pymongo": case "beanie": return Result.ok(value);
    default: return invalid("data layer", value, DATA_LAYERS);
  }
}

function compatibleDataLayers(backend: BackendSelection, database: Exclude<DatabaseKind, "none">): readonly DataLayerKind[] {
  if (backend.kind === "none") return ["none"];
  return [
    "none",
    ...DATA_LAYERS.filter((dataLayer) => {
      if (dataLayer === "none") return false;
      const support = DATA_LAYER_SUPPORT[dataLayer];
      return support.languages.includes(backend.kind)
        && support.databases.includes(database)
        && (support.frameworks === undefined || support.frameworks.includes(backend.framework));
    }),
  ];
}

function parseDatabase(value: string, dataLayerValue: string | undefined, backend: BackendSelection): ResultValue<DatabaseSelection, InputError> {
  const database = parseDatabaseKind(value);
  if (!database.ok) return database;
  if (database.value === "none") {
    return dataLayerValue === undefined || dataLayerValue === "none"
      ? Result.ok({ kind: "none" })
      : invalid("data layer", dataLayerValue, ["none"]);
  }
  const dataLayer = parseDataLayer(dataLayerValue ?? "none");
  if (!dataLayer.ok) return dataLayer;
  const compatible = compatibleDataLayers(backend, database.value);
  return compatible.includes(dataLayer.value)
    ? Result.ok({ kind: database.value, dataLayer: dataLayer.value })
    : invalid("data layer", dataLayer.value, compatible);
}

function preset(value: string): ResultValue<ResolvedInput, InputError> {
  switch (value) {
    case "expo-rust": return Result.ok({ clients: [{ kind: "expo" }], backend: { kind: "rust", framework: "axum" }, database: { kind: "none" }, orchestrator: "none", docker: false, githubActions: true });
    case "expo-rust-postgres": return Result.ok({ clients: [{ kind: "expo" }], backend: { kind: "rust", framework: "axum" }, database: { kind: "postgres", dataLayer: "sqlx" }, orchestrator: "none", docker: true, githubActions: true });
    case "next-go": return Result.ok({ clients: [{ kind: "next" }], backend: { kind: "go", framework: "chi" }, database: { kind: "none" }, orchestrator: "none", docker: false, githubActions: true });
    default: return invalid("preset", value, ["expo-rust", "expo-rust-postgres", "next-go"]);
  }
}

function cancelled(): ResultValue<never, InputError> {
  p.cancel("Project creation cancelled. No files were written.");
  return Result.error({ message: "Project creation was cancelled.", recovery: "Rerun turks when you are ready." });
}

function projectNameForCurrentDirectory(cwd: string): string {
  const normalized = path.basename(path.resolve(cwd))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return normalized.length > 0 ? normalized : "turks-app";
}

async function promptProjectName(): Promise<ResultValue<string, InputError>> {
  const value = await p.text({ message: "Project name?", placeholder: "my-app or .", defaultValue: "my-app", validate: (name) => name === "." || /^[a-z0-9][a-z0-9._-]*$/.test(name) ? undefined : "Use '.', or lowercase letters, numbers, dots, hyphens, and underscores." });
  return p.isCancel(value) ? cancelled() : Result.ok(value);
}

async function promptClients(): Promise<ResultValue<readonly ClientSelection[], InputError>> {
  const value = await p.multiselect<ClientKind>({
    message: "Clients? Leave empty for a service-only repository.",
    initialValues: ["expo"],
    required: false,
    options: CLIENTS.map((kind) => ({ value: kind, label: SUPPORT_LABELS.clients[kind] })),
  });
  return p.isCancel(value) ? cancelled() : Result.ok(value.map((kind) => ({ kind })));
}

async function promptBackend(): Promise<ResultValue<BackendSelection, InputError>> {
  const language = await p.select<string>({ message: "Backend language?", initialValue: "rust", options: [{ value: "rust", label: "Rust" }, { value: "go", label: "Go" }, { value: "typescript", label: "TypeScript" }, { value: "python", label: "Python" }, { value: "none", label: "None", hint: "client only" }] });
  if (p.isCancel(language)) return cancelled();
  const parsedLanguage = parseBackendLanguage(language);
  if (!parsedLanguage.ok || parsedLanguage.value === "none") return parsedLanguage.ok ? Result.ok({ kind: "none" }) : parsedLanguage;
  const frameworks = BACKEND_FRAMEWORKS[parsedLanguage.value];
  const framework = await p.select<string>({ message: `${SUPPORT_LABELS.languages[parsedLanguage.value]} framework?`, initialValue: frameworks[1] ?? "none", options: frameworks.map((value) => ({ value, label: SUPPORT_LABELS.frameworks[value] })) });
  return p.isCancel(framework) ? cancelled() : parseBackend(parsedLanguage.value, framework);
}

async function promptDatabase(backend: BackendSelection): Promise<ResultValue<DatabaseSelection, InputError>> {
  const database = await p.select<string>({ message: "Database?", initialValue: "postgres", options: DATABASES.map((value) => ({ value, label: SUPPORT_LABELS.databases[value] })) });
  if (p.isCancel(database)) return cancelled();
  const parsedDatabase = parseDatabaseKind(database);
  if (!parsedDatabase.ok || parsedDatabase.value === "none") return parsedDatabase.ok ? Result.ok({ kind: "none" }) : parsedDatabase;
  const layers = compatibleDataLayers(backend, parsedDatabase.value);
  const dataLayer = await p.select<string>({ message: "Data layer / ORM?", initialValue: "none", options: layers.map((value) => ({ value, label: value === "none" ? "None" : DATA_LAYER_SUPPORT[value].label })) });
  return p.isCancel(dataLayer) ? cancelled() : parseDatabase(parsedDatabase.value, dataLayer, backend);
}

async function promptBoolean(message: string, initialValue: boolean): Promise<ResultValue<boolean, InputError>> {
  const value = await p.confirm({ message, initialValue });
  return p.isCancel(value) ? cancelled() : Result.ok(value);
}

async function promptOrchestrator(): Promise<ResultValue<"none" | "moon", InputError>> {
  const value = await p.select<"none" | "moon">({ message: "Workspace orchestrator?", initialValue: "none", options: [{ value: "none", label: "None", hint: "recommended; native tools are enough" }, { value: "moon", label: "Moon", hint: "advanced task graph and caching" }] });
  return p.isCancel(value) ? cancelled() : Result.ok(value);
}

function frameworkOption(options: CliOptions, language: string): string | undefined {
  return options.framework ?? (language === "rust" ? options.rustFramework : language === "go" ? options.goFramework : language === "typescript" ? options.typescriptFramework : language === "python" ? options.pythonFramework : undefined);
}

function optionInput(projectName: string | undefined, options: CliOptions): ResultValue<ResolvedInput, InputError> {
  let input: ResolvedInput = projectName === undefined ? {} : { projectName };
  if (options.preset !== undefined) {
    const selected = preset(options.preset);
    if (!selected.ok) return selected;
    input = { ...input, ...selected.value };
  }
  const clientValue = options.client ?? options.mobile;
  if (clientValue !== undefined) {
    const clients = parseClients(clientValue);
    if (!clients.ok) return clients;
    input = { ...input, clients: clients.value };
  }
  if (options.backend !== undefined) {
    const backend = parseBackend(options.backend, frameworkOption(options, options.backend));
    if (!backend.ok) return backend;
    input = { ...input, backend: backend.value };
  }
  const dataLayerValue = options.dataLayer ?? options.dbClient;
  if (options.database !== undefined) {
    const backend = input.backend ?? { kind: "none" };
    const database = parseDatabase(options.database, dataLayerValue, backend);
    if (!database.ok) return database;
    input = { ...input, database: database.value };
  } else if (dataLayerValue !== undefined) {
    if (input.database === undefined || input.database.kind === "none") {
      return Result.error({
        message: `Data layer '${dataLayerValue}' was provided without a database.`,
        recovery: "Add --database with a compatible database, or remove --data-layer.",
      });
    }
    const backend = input.backend ?? { kind: "none" };
    const database = parseDatabase(input.database.kind, dataLayerValue, backend);
    if (!database.ok) return database;
    input = { ...input, database: database.value };
  }
  if (options.orchestrator !== undefined) {
    if (options.orchestrator !== "none" && options.orchestrator !== "moon") return invalid("orchestrator", options.orchestrator, ["none", "moon"]);
    input = { ...input, orchestrator: options.orchestrator };
  } else if (options.moon === true) input = { ...input, orchestrator: "moon" };
  if (options.docker !== undefined) input = { ...input, docker: options.docker };
  if (options.ci !== undefined) {
    if (options.ci === false) input = { ...input, githubActions: false };
    else {
      if (options.ci !== "github") return invalid("CI", String(options.ci), ["github"]);
      input = { ...input, githubActions: true };
    }
  }
  if (options.packageManager !== undefined && options.packageManager !== "pnpm") return invalid("package manager", options.packageManager, ["pnpm"]);
  return Result.ok(input);
}

export async function resolveInput(cwd: string, projectName: string | undefined, options: CliOptions): Promise<ResultValue<StackConfig, InputError | readonly ConfigIssue[]>> {
  const parsed = optionInput(projectName, options);
  if (!parsed.ok) return parsed;
  const input = parsed.value;
  const defaults = options.yes === true;

  const target = input.projectName !== undefined ? Result.ok(input.projectName) : defaults ? Result.ok("my-app") : await promptProjectName();
  if (!target.ok) return target;
  const name = target.value === "." ? projectNameForCurrentDirectory(cwd) : target.value;
  const clients = input.clients !== undefined ? Result.ok(input.clients) : defaults ? Result.ok([{ kind: "expo" }] as const) : await promptClients();
  if (!clients.ok) return clients;
  const backend = input.backend !== undefined ? Result.ok(input.backend) : defaults ? Result.ok({ kind: "rust", framework: "axum" } as const) : await promptBackend();
  if (!backend.ok) return backend;
  const database = input.database !== undefined ? Result.ok(input.database) : defaults ? Result.ok({ kind: "postgres", dataLayer: "sqlx" } as const) : await promptDatabase(backend.value);
  if (!database.ok) return database;
  const orchestrator = input.orchestrator !== undefined ? Result.ok(input.orchestrator) : defaults ? Result.ok("none" as const) : await promptOrchestrator();
  if (!orchestrator.ok) return orchestrator;
  const docker = input.docker !== undefined ? Result.ok(input.docker) : database.value.kind === "none" || database.value.kind === "sqlite" || defaults ? Result.ok(false) : await promptBoolean("Add Docker Compose for the database?", false);
  if (!docker.ok) return docker;
  const ci = input.githubActions !== undefined ? Result.ok(input.githubActions) : defaults ? Result.ok(false) : await promptBoolean("Add GitHub Actions?", true);
  if (!ci.ok) return ci;
  const git = options.git !== undefined ? Result.ok(options.git) : defaults ? Result.ok(true) : await promptBoolean("Initialize a Git repository?", true);
  if (!git.ok) return git;

  return StackConfigModule.create({
    projectName: name,
    destination: path.resolve(StackConfigModule.destination(cwd, target.value)),
    clients: clients.value,
    backend: backend.value,
    database: database.value,
    packageManager: "pnpm",
    orchestrator: orchestrator.value,
    docker: docker.value,
    githubActions: ci.value,
    install: options.install,
    initializeGit: git.value,
  });
}
