import type { StackConfig } from "./config.js";
import type { GenerationPlan } from "./planner.js";

export function formatPlan(config: StackConfig, plan: GenerationPlan): string {
  const lines = [
    `Project: ${config.projectName}`,
    `Destination: ${config.destination}`,
    "",
    "Stack:",
    `  Clients: ${config.clients.length === 0 ? "none" : config.clients.map((client) => client.kind).join(", ")}`,
    `  Backend: ${config.backend.kind === "none" ? "none" : `${config.backend.kind} + ${config.backend.framework}`}`,
    `  Database: ${config.database.kind === "none" ? "none" : `${config.database.kind} + ${config.database.dataLayer}`}`,
    `  Package manager: ${config.packageManager}`,
    `  Install dependencies: ${config.install ? "yes" : "no"}`,
    `  Workspace orchestrator: ${config.orchestrator}`,
    `  Docker Compose: ${config.docker ? "yes" : "no"}`,
    `  GitHub Actions: ${config.githubActions ? "yes" : "no"}`,
    `  Initialize Git: ${config.initializeGit ? "yes" : "no"}`,
    "",
    "Planned operations:",
    ...plan.generators.map((generator, index) => `  ${index + 1}. ${generator.label}`),
  ];
  return lines.join("\n");
}
