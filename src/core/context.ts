import type { StackConfig } from "./config.js";
import type { CommandRunner } from "./command.js";

export type GenerationContext = {
  readonly rootDir: string;
  readonly config: StackConfig;
  readonly runner: CommandRunner;
};
