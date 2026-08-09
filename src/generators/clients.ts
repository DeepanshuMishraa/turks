import type { Generator } from "../core/generator.js";
import { runGeneratorCommand } from "./shared.js";

export const expoGenerator: Generator = {
  id: "expo",
  label: "Expo client",
  dependencies: ["pnpm"],
  async generate(context) {
    return await runGeneratorCommand(context, "expo", {
      executable: "pnpm",
      args: ["dlx", "create-expo-app@latest", "apps/mobile", "--template", "blank-typescript", "--yes", "--no-install"],
    });
  },
};

export const nextGenerator: Generator = {
  id: "next",
  label: "Next.js client",
  dependencies: ["pnpm"],
  async generate(context) {
    return await runGeneratorCommand(context, "next", {
      executable: "pnpm",
      args: [
        "dlx",
        "create-next-app@latest",
        "apps/next",
        "--ts",
        "--eslint",
        "--app",
        "--src-dir",
        "--use-pnpm",
        "--import-alias",
        "@/*",
        "--yes",
        "--empty",
        "--skip-install",
        "--disable-git",
      ],
    });
  },
};

function commandClientGenerator(
  id: "react-vite" | "vue-vite" | "sveltekit" | "astro" | "react-native" | "tauri" | "electron",
  label: string,
  args: readonly string[],
): Generator {
  return {
    id,
    label,
    dependencies: ["pnpm"],
    async generate(context) {
      return await runGeneratorCommand(context, id, { executable: "pnpm", args });
    },
  };
}

export const reactViteGenerator = commandClientGenerator("react-vite", "React + Vite client", ["create", "vite", "apps/react", "--template", "react-ts"]);
export const vueViteGenerator = commandClientGenerator("vue-vite", "Vue + Vite client", ["create", "vite", "apps/vue", "--template", "vue-ts"]);
export const svelteKitGenerator = commandClientGenerator("sveltekit", "SvelteKit client", ["dlx", "sv", "create", "apps/svelte", "--template", "minimal", "--types", "ts", "--no-add-ons", "--no-install"]);
export const astroGenerator = commandClientGenerator("astro", "Astro client", ["dlx", "create-astro@latest", "apps/astro", "--template", "minimal", "--no-install", "--no-git", "--yes", "--no-ai", "--skip-houston"]);
export const reactNativeGenerator = commandClientGenerator("react-native", "React Native client", ["dlx", "@react-native-community/cli@latest", "init", "Mobile", "--directory", "apps/react-native", "--pm", "npm", "--skip-install", "--install-pods", "false", "--skip-git-init"]);
export const tauriGenerator = commandClientGenerator("tauri", "Tauri desktop client", ["dlx", "create-tauri-app", "apps/tauri", "--manager", "pnpm", "--template", "react-ts", "--yes"]);
export const electronGenerator = commandClientGenerator("electron", "Electron desktop client", ["dlx", "create-electron-app@latest", "apps/electron", "--template=vite-typescript", "--skip-git"]);
