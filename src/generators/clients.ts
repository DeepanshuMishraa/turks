import type { Generator } from "../core/generator.js";
import { PackageManager } from "../core/package-manager.js";
import { runGeneratorCommand } from "./shared.js";

async function runScaffold(
  context: Parameters<Generator["generate"]>[0],
  id: Parameters<typeof runGeneratorCommand>[1],
  packageName: string,
  args: readonly string[],
) {
  return await runGeneratorCommand(context, id, PackageManager.executePackage(context.config.packageManager, packageName, args));
}

export const expoGenerator: Generator = {
  id: "expo",
  label: "Expo client",
  dependencies: ["package-manager"],
  async generate(context) {
    return await runScaffold(context, "expo", "create-expo-app@latest", ["apps/mobile", "--template", "blank-typescript", "--yes", "--no-install"]);
  },
};

export const nextGenerator: Generator = {
  id: "next",
  label: "Next.js client",
  dependencies: ["package-manager"],
  async generate(context) {
    return await runScaffold(context, "next", "create-next-app@latest", [
      "apps/next",
      "--ts",
      "--eslint",
      "--app",
      "--src-dir",
      `--use-${context.config.packageManager}`,
      "--import-alias",
      "@/*",
      "--yes",
      "--empty",
      "--skip-install",
      "--disable-git",
    ]);
  },
};

function commandClientGenerator(
  id: "react-vite" | "vue-vite" | "sveltekit" | "astro" | "react-native" | "electron",
  label: string,
  packageName: string,
  args: readonly string[],
): Generator {
  return {
    id,
    label,
    dependencies: ["package-manager"],
    async generate(context) {
      return await runScaffold(context, id, packageName, args);
    },
  };
}

export const reactViteGenerator = commandClientGenerator("react-vite", "React + Vite client", "create-vite@latest", ["apps/react", "--template", "react-ts"]);
export const vueViteGenerator = commandClientGenerator("vue-vite", "Vue + Vite client", "create-vite@latest", ["apps/vue", "--template", "vue-ts"]);
export const svelteKitGenerator = commandClientGenerator("sveltekit", "SvelteKit client", "sv", ["create", "apps/svelte", "--template", "minimal", "--types", "ts", "--no-add-ons", "--no-install"]);
export const astroGenerator = commandClientGenerator("astro", "Astro client", "create-astro@latest", ["apps/astro", "--template", "minimal", "--no-install", "--no-git", "--yes", "--no-ai", "--skip-houston"]);
export const reactNativeGenerator = commandClientGenerator("react-native", "React Native client", "@react-native-community/cli@latest", ["init", "Mobile", "--directory", "apps/react-native", "--skip-install", "--install-pods", "false", "--skip-git-init"]);
export const electronGenerator = commandClientGenerator("electron", "Electron desktop client", "create-electron-app@latest", ["apps/electron", "--template=vite-typescript", "--skip-git"]);

export const tauriGenerator: Generator = {
  id: "tauri",
  label: "Tauri desktop client",
  dependencies: ["package-manager"],
  async generate(context) {
    return await runScaffold(context, "tauri", "create-tauri-app", ["apps/tauri", "--manager", context.config.packageManager, "--template", "react-ts", "--yes"]);
  },
};
