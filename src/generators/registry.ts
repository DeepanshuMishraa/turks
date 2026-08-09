import type { Generator, GeneratorId } from "../core/generator.js";
import { actixWebGenerator, axumGenerator, chiGenerator, djangoGenerator, echoGenerator, expressGenerator, fastapiGenerator, fastifyGenerator, fiberGenerator, flaskGenerator, ginGenerator, goGenerator, honoGenerator, litestarGenerator, nestGenerator, pythonGenerator, rocketGenerator, rustGenerator, standardLibraryGenerator, typescriptGenerator } from "./backends.js";
import { astroGenerator, electronGenerator, expoGenerator, nextGenerator, reactNativeGenerator, reactViteGenerator, svelteKitGenerator, tauriGenerator, vueViteGenerator } from "./clients.js";
import { beanieGenerator, bunGenerator, dieselGenerator, djangoOrmGenerator, drizzleGenerator, entGenerator, gormGenerator, kyselyGenerator, mongodbGenerator, mongooseGenerator, mysqlGenerator, postgresGenerator, prismaGenerator, pymongoGenerator, seaormGenerator, sqlalchemyGenerator, sqliteGenerator, sqlxGenerator, tortoiseGenerator, typeormGenerator } from "./data.js";
import { dockerGenerator, githubActionsGenerator, moonGenerator } from "./integrations.js";
import { readmeGenerator } from "./readme.js";
import { cargoGenerator, gitGenerator, installGenerator, packageManagerGenerator, rootGenerator } from "./root.js";

const generators: Readonly<Record<GeneratorId, Generator>> = {
  root: rootGenerator, "package-manager": packageManagerGenerator,
  expo: expoGenerator, next: nextGenerator, "react-vite": reactViteGenerator, "vue-vite": vueViteGenerator,
  sveltekit: svelteKitGenerator, astro: astroGenerator, "react-native": reactNativeGenerator, tauri: tauriGenerator, electron: electronGenerator,
  rust: rustGenerator, axum: axumGenerator, "actix-web": actixWebGenerator, rocket: rocketGenerator,
  go: goGenerator, stdlib: standardLibraryGenerator, chi: chiGenerator, gin: ginGenerator, fiber: fiberGenerator, echo: echoGenerator,
  typescript: typescriptGenerator, hono: honoGenerator, express: expressGenerator, fastify: fastifyGenerator, nest: nestGenerator,
  python: pythonGenerator, fastapi: fastapiGenerator, django: djangoGenerator, flask: flaskGenerator, litestar: litestarGenerator,
  cargo: cargoGenerator,
  postgres: postgresGenerator, mysql: mysqlGenerator, sqlite: sqliteGenerator, mongodb: mongodbGenerator,
  sqlx: sqlxGenerator, seaorm: seaormGenerator, diesel: dieselGenerator,
  gorm: gormGenerator, ent: entGenerator, bun: bunGenerator,
  drizzle: drizzleGenerator, prisma: prismaGenerator, typeorm: typeormGenerator, kysely: kyselyGenerator, mongoose: mongooseGenerator,
  sqlalchemy: sqlalchemyGenerator, "django-orm": djangoOrmGenerator, tortoise: tortoiseGenerator, pymongo: pymongoGenerator, beanie: beanieGenerator,
  moon: moonGenerator, docker: dockerGenerator, "github-actions": githubActionsGenerator,
  readme: readmeGenerator, install: installGenerator, git: gitGenerator,
};

export const GeneratorRegistry = {
  get(id: GeneratorId): Generator | undefined {
    return generators[id];
  },
  all(): readonly Generator[] {
    return Object.values(generators);
  },
} as const;
