import type { Generator, GeneratorId } from "../core/generator.js";
import { actixWebGenerator, axumGenerator, chiGenerator, djangoGenerator, echoGenerator, expressGenerator, fastapiGenerator, fastifyGenerator, fiberGenerator, flaskGenerator, ginGenerator, goGenerator, honoGenerator, litestarGenerator, nestGenerator, pythonGenerator, rocketGenerator, rustGenerator, standardLibraryGenerator, typescriptGenerator } from "./backends.js";
import { astroGenerator, electronGenerator, expoGenerator, nextGenerator, reactNativeGenerator, reactViteGenerator, svelteKitGenerator, tauriGenerator, vueViteGenerator } from "./clients.js";
import { beanieGenerator, bunGenerator, dieselGenerator, djangoOrmGenerator, drizzleGenerator, entGenerator, gormGenerator, kyselyGenerator, mongodbGenerator, mongooseGenerator, mysqlGenerator, postgresGenerator, prismaGenerator, pymongoGenerator, seaormGenerator, sqlalchemyGenerator, sqliteGenerator, sqlxGenerator, tortoiseGenerator, typeormGenerator } from "./data.js";
import { dockerGenerator, githubActionsGenerator, moonGenerator } from "./integrations.js";
import { readmeGenerator } from "./readme.js";
import { cargoGenerator, gitGenerator, installGenerator, pnpmGenerator, rootGenerator } from "./root.js";

const generators: readonly Generator[] = [
  rootGenerator,
  pnpmGenerator,
  expoGenerator,
  nextGenerator,
  reactViteGenerator,
  vueViteGenerator,
  svelteKitGenerator,
  astroGenerator,
  reactNativeGenerator,
  tauriGenerator,
  electronGenerator,
  rustGenerator,
  axumGenerator,
  actixWebGenerator,
  rocketGenerator,
  goGenerator,
  standardLibraryGenerator,
  chiGenerator,
  ginGenerator,
  fiberGenerator,
  echoGenerator,
  typescriptGenerator,
  honoGenerator,
  expressGenerator,
  fastifyGenerator,
  nestGenerator,
  pythonGenerator,
  fastapiGenerator,
  djangoGenerator,
  flaskGenerator,
  litestarGenerator,
  cargoGenerator,
  postgresGenerator,
  mysqlGenerator,
  sqliteGenerator,
  mongodbGenerator,
  sqlxGenerator,
  seaormGenerator,
  dieselGenerator,
  gormGenerator,
  entGenerator,
  bunGenerator,
  drizzleGenerator,
  prismaGenerator,
  typeormGenerator,
  kyselyGenerator,
  mongooseGenerator,
  sqlalchemyGenerator,
  djangoOrmGenerator,
  tortoiseGenerator,
  pymongoGenerator,
  beanieGenerator,
  moonGenerator,
  dockerGenerator,
  githubActionsGenerator,
  readmeGenerator,
  installGenerator,
  gitGenerator,
];

export const GeneratorRegistry = {
  get(id: GeneratorId): Generator | undefined {
    return generators.find((generator) => generator.id === id);
  },
  all(): readonly Generator[] {
    return generators;
  },
} as const;
