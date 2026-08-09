import type { Generator } from "../core/generator.js";
import { Result } from "../core/result.js";
import { generationFailure, writeProjectFile } from "./shared.js";

export const moonGenerator: Generator = {
  id: "moon",
  label: "Moon workspace",
  dependencies: ["root"],
  async generate(context) {
    try {
      await writeProjectFile(
        context,
        ".moon/workspace.yml",
        `$schema: 'https://moonrepo.dev/schemas/workspace.json'\nprojects:\n  - 'apps/*'\nvcs:\n  manager: git\n`,
      );
      await writeProjectFile(
        context,
        ".moon/toolchains.yml",
        `$schema: 'https://moonrepo.dev/schemas/toolchains.json'\njavascript:\n  packageManager: pnpm\npnpm:\n  version: '10.15.0'\n`,
      );
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("moon", error);
    }
  },
};

export const dockerGenerator: Generator = {
  id: "docker",
  label: "Docker Compose",
  dependencies: ["root"],
  async generate(context) {
    if (context.config.database.kind === "none" || context.config.database.kind === "sqlite") {
      return generationFailure("docker", new Error("No containerized database was selected."));
    }
    const service = context.config.database.kind === "postgres"
      ? `  postgres:\n    image: postgres:17-alpine\n    environment:\n      POSTGRES_DB: app\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: postgres\n    ports:\n      - '5432:5432'\n    volumes:\n      - database-data:/var/lib/postgresql/data\n    healthcheck:\n      test: ['CMD-SHELL', 'pg_isready -U postgres -d app']\n      interval: 5s\n      timeout: 5s\n      retries: 10\n`
      : context.config.database.kind === "mysql"
        ? `  mysql:\n    image: mysql:8.4\n    environment:\n      MYSQL_DATABASE: app\n      MYSQL_USER: mysql\n      MYSQL_PASSWORD: mysql\n      MYSQL_ROOT_PASSWORD: root\n    ports:\n      - '3306:3306'\n    volumes:\n      - database-data:/var/lib/mysql\n`
        : `  mongodb:\n    image: mongo:8\n    ports:\n      - '27017:27017'\n    volumes:\n      - database-data:/data/db\n`;
    try {
      await writeProjectFile(
        context,
        "compose.yml",
        `services:\n${service}\nvolumes:\n  database-data:\n`,
      );
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("docker", error);
    }
  },
};

export const githubActionsGenerator: Generator = {
  id: "github-actions",
  label: "GitHub Actions",
  dependencies: ["root"],
  async generate(context) {
    const rust = context.config.backend.kind === "rust";
    const go = context.config.backend.kind === "go";
    const python = context.config.backend.kind === "python";
    const languageSetup = [
      rust ? "      - uses: dtolnay/rust-toolchain@stable\n" : "",
      go ? "      - uses: actions/setup-go@v5\n        with:\n          go-version: '1.24'\n" : "",
      python ? "      - uses: astral-sh/setup-uv@v6\n" : "",
    ].join("");
    try {
      await writeProjectFile(
        context,
        ".github/workflows/ci.yml",
        `name: CI\n\non:\n  push:\n  pull_request:\n\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: pnpm/action-setup@v4\n        with:\n          version: 10.15.0\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: pnpm\n${languageSetup}      - run: pnpm install --frozen-lockfile\n      - run: pnpm build\n`,
      );
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("github-actions", error);
    }
  },
};
