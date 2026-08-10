import type { GenerationContext } from "./context.js";
import type { Result } from "./result.js";

export type GeneratorId =
  | "root"
  | "package-manager"
  | "expo"
  | "next"
  | "react-vite"
  | "vue-vite"
  | "sveltekit"
  | "astro"
  | "react-native"
  | "tauri"
  | "electron"
  | "rust"
  | "axum"
  | "actix-web"
  | "rocket"
  | "go"
  | "stdlib"
  | "chi"
  | "gin"
  | "fiber"
  | "echo"
  | "typescript"
  | "hono"
  | "express"
  | "fastify"
  | "nest"
  | "python"
  | "fastapi"
  | "django"
  | "flask"
  | "litestar"
  | "cargo"
  | "postgres"
  | "mysql"
  | "sqlite"
  | "mongodb"
  | "sqlx"
  | "seaorm"
  | "diesel"
  | "gorm"
  | "ent"
  | "bun"
  | "drizzle"
  | "prisma"
  | "typeorm"
  | "kysely"
  | "mongoose"
  | "sqlalchemy"
  | "django-orm"
  | "tortoise"
  | "pymongo"
  | "beanie"
  | "moon"
  | "docker"
  | "github-actions"
  | "readme"
  | "template"
  | "template-install"
  | "install"
  | "git";

export type GenerationError = {
  readonly code: "generation-failed" | "invalid-plan" | "destination-exists";
  readonly generator?: GeneratorId;
  readonly message: string;
  readonly recovery: string;
};

export interface Generator {
  readonly id: GeneratorId;
  readonly label: string;
  readonly dependencies: readonly GeneratorId[];
  generate(context: GenerationContext): Promise<Result<void, GenerationError>>;
}
