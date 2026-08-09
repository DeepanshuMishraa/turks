import type { Command } from "./command.js";

export type PackageManager = "npm" | "pnpm" | "bun";

const versions: Readonly<Record<PackageManager, string>> = {
  npm: "12.0.2",
  pnpm: "11.20.0",
  bun: "1.3.14",
};

export const PackageManager = {
  values: ["npm", "pnpm", "bun"] as const,

  manifestValue(packageManager: PackageManager): string {
    return `${packageManager}@${versions[packageManager]}`;
  },

  version(packageManager: PackageManager): string {
    return versions[packageManager];
  },

  installCommand(packageManager: PackageManager): Pick<Command, "executable" | "args"> {
    return { executable: packageManager, args: ["install"] };
  },

  ciInstallCommand(packageManager: PackageManager): string {
    return packageManager === "npm" ? "npm install" : `${packageManager} install --frozen-lockfile`;
  },

  runScript(packageManager: PackageManager, script: string): string {
    return `${packageManager} run ${script}`;
  },

  runWorkspaceScript(packageManager: PackageManager, workspace: string, script: string, args: readonly string[] = []): string {
    const quotedWorkspace = JSON.stringify(workspace);
    const renderedArgs = args.length === 0 ? "" : ` ${args.join(" ")}`;
    switch (packageManager) {
      case "npm": return `npm run ${script} --workspace ${quotedWorkspace}${args.length === 0 ? "" : ` --${renderedArgs}`}`;
      case "pnpm": return `pnpm --filter ${quotedWorkspace} ${script}${renderedArgs}`;
      case "bun": return `bun run --filter ${quotedWorkspace} ${script}${renderedArgs}`;
    }
  },

  executePackage(packageManager: PackageManager, packageName: string, args: readonly string[]): Pick<Command, "executable" | "args"> {
    switch (packageManager) {
      case "npm": return { executable: "npx", args: ["--yes", packageName, ...args] };
      case "pnpm": return { executable: "pnpm", args: ["dlx", packageName, ...args] };
      case "bun": return { executable: "bunx", args: [packageName, ...args] };
    }
  },
} as const;
