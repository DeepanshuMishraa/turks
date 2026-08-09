import { describe, expect, it } from "vitest";
import { PackageManager } from "../src/core/package-manager.js";

describe("PackageManager", () => {
  it("uses each selected manager for package execution", () => {
    expect(PackageManager.executePackage("npm", "create-vite@latest", ["app"])).toEqual({
      executable: "npx",
      args: ["--yes", "create-vite@latest", "app"],
    });
    expect(PackageManager.executePackage("pnpm", "create-vite@latest", ["app"])).toEqual({
      executable: "pnpm",
      args: ["dlx", "create-vite@latest", "app"],
    });
    expect(PackageManager.executePackage("bun", "create-vite@latest", ["app"])).toEqual({
      executable: "bunx",
      args: ["create-vite@latest", "app"],
    });
  });

  it("uses reproducible CI installs when lockfiles support freezing", () => {
    expect(PackageManager.ciInstallCommand("npm")).toBe("npm install");
    expect(PackageManager.ciInstallCommand("pnpm")).toBe("pnpm install --frozen-lockfile");
    expect(PackageManager.ciInstallCommand("bun")).toBe("bun install --frozen-lockfile");
  });

  it("uses manager-specific workspace commands", () => {
    expect(PackageManager.runWorkspaceScript("npm", "./apps/api", "dev")).toBe('npm run dev --workspace "./apps/api"');
    expect(PackageManager.runWorkspaceScript("pnpm", "./apps/api", "dev")).toBe('pnpm --filter "./apps/api" dev');
    expect(PackageManager.runWorkspaceScript("bun", "./apps/api", "dev")).toBe('bun run --filter "./apps/api" dev');
    expect(PackageManager.runWorkspaceScript("npm", "./apps/tauri", "tauri", ["dev"])).toBe('npm run tauri --workspace "./apps/tauri" -- dev');
  });
});
