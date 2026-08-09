import path from "node:path";
import type { DataLayerKind, DatabaseKind } from "../core/support.js";
import type { Generator } from "../core/generator.js";
import { Result } from "../core/result.js";
import { generationFailure, mergeProjectCompilerOptions, mergeProjectPackageJson, replaceProjectFile, runGeneratorCommand, writeProjectFile } from "./shared.js";

const SERVER_DATABASE_URLS: Readonly<Record<Exclude<DatabaseKind, "none" | "sqlite">, string>> = {
  postgres: "postgres://postgres:postgres@localhost:5432/app",
  mysql: "mysql://mysql:mysql@localhost:3306/app",
  mongodb: "mongodb://localhost:27017/app",
};

function databaseUrl(database: Exclude<DatabaseKind, "none">, dataLayer: DataLayerKind): string {
  if (database !== "sqlite") return SERVER_DATABASE_URLS[database];
  switch (dataLayer) {
    case "prisma": return "file:./app.db";
    case "sqlalchemy": case "django-orm": return "sqlite:///app.db";
    case "drizzle": case "typeorm": case "kysely": case "gorm": case "ent": case "bun": case "diesel": case "none": return "app.db";
    case "sqlx": case "seaorm": case "tortoise": return "sqlite://app.db";
    case "mongoose": case "pymongo": case "beanie": return "app.db";
  }
}

function databaseGenerator(id: Exclude<DatabaseKind, "none">, label: string): Generator {
  return {
    id,
    label,
    dependencies: ["root"],
    async generate(context) {
      try {
        const dataLayer = context.config.database.kind === "none" ? "none" : context.config.database.dataLayer;
        await writeProjectFile(context, ".env.example", `DATABASE_URL=${databaseUrl(id, dataLayer)}\n`);
        return Result.ok(undefined);
      } catch (error) {
        return generationFailure(id, error);
      }
    },
  };
}

export const postgresGenerator = databaseGenerator("postgres", "PostgreSQL");
export const mysqlGenerator = databaseGenerator("mysql", "MySQL");
export const sqliteGenerator = databaseGenerator("sqlite", "SQLite");
export const mongodbGenerator = databaseGenerator("mongodb", "MongoDB");

function selectedDatabase(context: Parameters<Generator["generate"]>[0]): Exclude<DatabaseKind, "none"> {
  return context.config.database.kind === "none" ? "sqlite" : context.config.database.kind;
}

function rustFeature(database: Exclude<DatabaseKind, "none">): string {
  return database === "mongodb" ? "" : database;
}

function rustDataLayerGenerator(
  id: "sqlx" | "seaorm" | "diesel",
  label: string,
  crate: string,
  features: (database: Exclude<DatabaseKind, "none">) => string,
): Generator {
  return {
    id,
    label,
    dependencies: ["rust"],
    async generate(context) {
      const featureList = features(selectedDatabase(context));
      const args = featureList.length === 0 ? ["add", crate] : ["add", crate, "--features", featureList];
      return await runGeneratorCommand(context, id, {
        executable: "cargo",
        args,
        cwd: path.join(context.rootDir, "apps/api"),
      });
    },
  };
}

export const sqlxGenerator = rustDataLayerGenerator("sqlx", "SQLx", "sqlx", (database) => `runtime-tokio,tls-rustls,${rustFeature(database)}`);
export const seaormGenerator = rustDataLayerGenerator("seaorm", "SeaORM", "sea-orm", (database) => `runtime-tokio-rustls,sqlx-${rustFeature(database)}`);
export const dieselGenerator: Generator = {
  id: "diesel",
  label: "Diesel",
  dependencies: ["rust"],
  async generate(context) {
    const database = selectedDatabase(context);
    const cwd = path.join(context.rootDir, "apps/api");
    const diesel = await runGeneratorCommand(context, "diesel", {
      executable: "cargo",
      args: ["add", "diesel", "--features", rustFeature(database)],
      cwd,
    });
    if (!diesel.ok) return diesel;
    const native: readonly [packageName: string, feature: string] = database === "mysql"
      ? ["mysqlclient-sys", "bundled"]
      : database === "postgres"
        ? ["pq-sys", "bundled"]
        : ["libsqlite3-sys", "bundled"];
    return await runGeneratorCommand(context, "diesel", {
      executable: "cargo",
      args: ["add", native[0], "--features", native[1]],
      cwd,
    });
  },
};

const GO_DATA_PACKAGES = {
  gorm: {
    base: "gorm.io/gorm",
    drivers: { postgres: "gorm.io/driver/postgres", mysql: "gorm.io/driver/mysql", sqlite: "gorm.io/driver/sqlite" },
  },
  ent: {
    base: "entgo.io/ent",
    drivers: { postgres: "github.com/jackc/pgx/v5/stdlib", mysql: "github.com/go-sql-driver/mysql", sqlite: "modernc.org/sqlite" },
  },
  bun: {
    base: "github.com/uptrace/bun",
    drivers: { postgres: "github.com/uptrace/bun/driver/pgdriver", mysql: "github.com/go-sql-driver/mysql", sqlite: "github.com/uptrace/bun/driver/sqliteshim" },
  },
} as const;

function goDataLayerGenerator(id: "gorm" | "ent" | "bun", label: string): Generator {
  return {
    id,
    label,
    dependencies: ["go"],
    async generate(context) {
      const database = selectedDatabase(context);
      if (database === "mongodb") {
        return generationFailure(id, new Error(`${label} does not support MongoDB.`));
      }
      const packages = GO_DATA_PACKAGES[id];
      return await runGeneratorCommand(context, id, {
        executable: "go",
        args: ["get", packages.base, packages.drivers[database]],
        cwd: path.join(context.rootDir, "apps/api"),
      });
    },
  };
}

export const gormGenerator = goDataLayerGenerator("gorm", "GORM");
export const entGenerator = goDataLayerGenerator("ent", "Ent");
export const bunGenerator = goDataLayerGenerator("bun", "Bun");

const TYPESCRIPT_DEPENDENCIES: Readonly<Record<"drizzle" | "prisma" | "typeorm" | "kysely" | "mongoose", {
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}>> = {
  drizzle: { dependencies: { "drizzle-orm": "^0.44.0" }, devDependencies: { "drizzle-kit": "^0.31.0" } },
  prisma: { dependencies: { "@prisma/client": "^6.14.0" }, devDependencies: { prisma: "^6.14.0" } },
  typeorm: { dependencies: { typeorm: "^0.3.26", "reflect-metadata": "^0.2.2" } },
  kysely: { dependencies: { kysely: "^0.28.0" } },
  mongoose: { dependencies: { mongoose: "^8.18.0" } },
};

function databaseDriver(database: Exclude<DatabaseKind, "none">): Readonly<Record<string, string>> {
  switch (database) {
    case "postgres": return { pg: "^8.16.0" };
    case "mysql": return { mysql2: "^3.14.0" };
    case "sqlite": return { "better-sqlite3": "^12.2.0" };
    case "mongodb": return { mongodb: "^6.19.0" };
  }
}

function prismaProvider(database: Exclude<DatabaseKind, "none">): string {
  return database === "postgres" ? "postgresql" : database;
}

function typeScriptDataLayerGenerator(id: "drizzle" | "prisma" | "typeorm" | "kysely" | "mongoose", label: string): Generator {
  return {
    id,
    label,
    dependencies: ["typescript"],
    async generate(context) {
      const database = selectedDatabase(context);
      const packages = TYPESCRIPT_DEPENDENCIES[id];
      try {
        const dependencies = { ...packages.dependencies, ...databaseDriver(database) };
        await mergeProjectPackageJson(
          context,
          "apps/api/package.json",
          packages.devDependencies === undefined
            ? { dependencies }
            : { dependencies, devDependencies: packages.devDependencies },
        );
        if (id === "typeorm") {
          await mergeProjectCompilerOptions(context, "apps/api/tsconfig.json", {
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
          });
        }
        if (id === "prisma") {
          await writeProjectFile(context, "apps/api/prisma/schema.prisma", `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "${prismaProvider(database)}"\n  url      = env("DATABASE_URL")\n}\n`);
        }
        if (id === "drizzle") {
          await writeProjectFile(context, "apps/api/drizzle.config.ts", `import { defineConfig } from "drizzle-kit";\n\nexport default defineConfig({ dialect: "${database === "postgres" ? "postgresql" : database}", schema: "./src/schema.ts", dbCredentials: { url: process.env.DATABASE_URL ?? "" } });\n`);
          await writeProjectFile(context, "apps/api/src/schema.ts", "// Add your Drizzle schema here.\n");
        }
        return Result.ok(undefined);
      } catch (error) {
        return generationFailure(id, error);
      }
    },
  };
}

export const drizzleGenerator = typeScriptDataLayerGenerator("drizzle", "Drizzle");
export const prismaGenerator = typeScriptDataLayerGenerator("prisma", "Prisma");
export const typeormGenerator = typeScriptDataLayerGenerator("typeorm", "TypeORM");
export const kyselyGenerator = typeScriptDataLayerGenerator("kysely", "Kysely");
export const mongooseGenerator = typeScriptDataLayerGenerator("mongoose", "Mongoose");

const PYTHON_PACKAGES: Readonly<Record<"sqlalchemy" | "tortoise" | "pymongo" | "beanie", readonly string[]>> = {
  sqlalchemy: ["sqlalchemy>=2.0"],
  tortoise: ["tortoise-orm>=0.25"],
  pymongo: ["pymongo>=4.14"],
  beanie: ["beanie>=1.30", "pymongo>=4.14"],
};

function insertPythonDependencies(contents: string, packages: readonly string[]): string {
  const anchor = "dependencies = [";
  if (!contents.includes(anchor)) {
    throw new Error(`apps/api/pyproject.toml is missing the '${anchor}' dependency anchor.`);
  }
  return contents.replace(anchor, `${anchor}\n${packages.map((item) => `  "${item}",`).join("\n")}\n`);
}

function pythonLayerPackages(
  id: "sqlalchemy" | "tortoise" | "pymongo" | "beanie",
  database: Exclude<DatabaseKind, "none">,
): readonly string[] {
  const driver = id === "sqlalchemy"
    ? database === "postgres" ? "psycopg[binary]>=3.2" : database === "mysql" ? "pymysql>=1.1" : undefined
    : id === "tortoise"
      ? database === "postgres" ? "asyncpg>=0.30" : database === "mysql" ? "asyncmy>=0.2" : "aiosqlite>=0.21"
      : undefined;
  return [...new Set([...PYTHON_PACKAGES[id], ...(driver === undefined ? [] : [driver])])];
}

function pythonDataLayerGenerator(id: "sqlalchemy" | "tortoise" | "pymongo" | "beanie", label: string): Generator {
  return {
    id,
    label,
    dependencies: ["python"],
    async generate(context) {
      const database = selectedDatabase(context);
      const packages = pythonLayerPackages(id, database);
      try {
        await replaceProjectFile(context, "apps/api/pyproject.toml", (contents) => insertPythonDependencies(contents, packages));
        return Result.ok(undefined);
      } catch (error) {
        return generationFailure(id, error);
      }
    },
  };
}

export const sqlalchemyGenerator = pythonDataLayerGenerator("sqlalchemy", "SQLAlchemy");
export const tortoiseGenerator = pythonDataLayerGenerator("tortoise", "Tortoise ORM");
export const pymongoGenerator = pythonDataLayerGenerator("pymongo", "PyMongo");
export const beanieGenerator = pythonDataLayerGenerator("beanie", "Beanie");

export const djangoOrmGenerator: Generator = {
  id: "django-orm",
  label: "Django ORM",
  dependencies: ["django"],
  async generate(context) {
    const database = selectedDatabase(context);
    const packages = database === "postgres"
      ? ["dj-database-url>=2.3", "psycopg[binary]>=3.2"]
      : database === "mysql"
        ? ["dj-database-url>=2.3", "pymysql>=1.1"]
        : ["dj-database-url>=2.3"];
    try {
      await replaceProjectFile(context, "apps/api/pyproject.toml", (contents) => insertPythonDependencies(contents, packages));
      await writeProjectFile(context, "apps/api/config/database.py", `import dj_database_url\n\nDATABASES = {"default": dj_database_url.config(default="${databaseUrl(database, "django-orm")}")}\n`);
      await replaceProjectFile(context, "apps/api/config/settings.py", (contents) => `${contents}\nfrom .database import DATABASES\n`);
      return Result.ok(undefined);
    } catch (error) {
      return generationFailure("django-orm", error);
    }
  },
};
