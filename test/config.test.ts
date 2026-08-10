import path from "node:path";
import { describe, expect, it } from "vitest";
import { StackConfig, type StackConfig as StackConfigValue } from "../src/core/config.js";
import { Planner } from "../src/core/planner.js";
import { resolveInput } from "../src/cli/input.js";

function referenceConfig(): StackConfigValue {
  return {
    projectName: "my-app",
    destination: "/tmp/my-app",
    template: "none",
    clients: [{ kind: "expo" }],
    backend: { kind: "rust", framework: "axum" },
    database: { kind: "postgres", dataLayer: "sqlx" },
    packageManager: "pnpm",
    orchestrator: "none",
    docker: true,
    githubActions: true,
    install: false,
    initializeGit: false,
  };
}

describe("StackConfig", () => {
  it("accepts the primary v0.1 stack", () => {
    expect(StackConfig.create(referenceConfig())).toEqual({ ok: true, value: referenceConfig() });
  });

  it("rejects SQLx without Rust", () => {
    const result = StackConfig.create({
      ...referenceConfig(),
      backend: { kind: "go", framework: "chi" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.map((issue) => issue.code)).toContain("incompatible-data-layer");
  });

  it("resolves a dot target to the current directory", async () => {
    const result = await resolveInput("/tmp/Current Project", ".", {
      install: false,
      git: false,
      yes: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.projectName).toBe("current-project");
    expect(result.value.destination).toBe(path.resolve("/tmp/Current Project"));
  });

  it("initializes Git when non-interactive defaults are accepted", async () => {
    const result = await resolveInput("/tmp", "my-app", {
      install: false,
      yes: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.initializeGit).toBe(true);
  });

  it("accepts every supported package manager", async () => {
    for (const packageManager of ["npm", "pnpm", "bun"] as const) {
      const result = await resolveInput("/tmp", `app-${packageManager}`, {
        packageManager,
        install: false,
        git: false,
        yes: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.packageManager).toBe(packageManager);
    }
  });

  it("installs dependencies when non-interactive defaults are accepted", async () => {
    const result = await resolveInput("/tmp", "my-app", { git: false, yes: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.packageManager).toBe("pnpm");
    expect(result.value.install).toBe(true);
  });

  it("rejects unsupported package managers", async () => {
    const result = await resolveInput("/tmp", "my-app", {
      packageManager: "yarn",
      install: false,
      git: false,
      yes: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok || !("message" in result.error)) return;
    expect(result.error.message).toContain("Invalid package manager");
    expect(result.error.recovery).toContain("npm, pnpm, bun");
  });

  it("rejects a data layer without a database option", async () => {
    const result = await resolveInput("/tmp", "my-app", {
      dataLayer: "sqlx",
      install: false,
      git: false,
      yes: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected data-layer validation to fail.");
    if (!("message" in result.error)) throw new Error("Expected an input validation error.");
    expect(result.error.message).toContain("without a database");
  });

  it("allows explicit preset boolean overrides", async () => {
    const result = await resolveInput("/tmp", "my-app", {
      preset: "expo-rust-postgres",
      docker: false,
      ci: false,
      install: false,
      git: false,
      yes: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.docker).toBe(false);
    expect(result.value.githubActions).toBe(false);
  });

  it("applies a data-layer override to a preset database", async () => {
    const result = await resolveInput("/tmp", "my-app", {
      preset: "expo-rust-postgres",
      dataLayer: "seaorm",
      install: false,
      git: false,
      yes: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.database).toEqual({ kind: "postgres", dataLayer: "seaorm" });
  });

  it("reports an actionable error when a preset has no database", async () => {
    const result = await resolveInput("/tmp", "my-app", {
      preset: "next-go",
      dataLayer: "gorm",
      install: false,
      git: false,
      yes: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected preset data-layer validation to fail.");
    if (!("message" in result.error)) throw new Error("Expected an input validation error.");
    expect(result.error.message).toBe("Data layer 'gorm' was provided without a database.");
    expect(result.error.recovery).toContain("Add --database");
  });

  it("accepts an explicit data-layer opt-out for a preset with no database", async () => {
    const result = await resolveInput("/tmp", "my-app", {
      preset: "expo-rust",
      dataLayer: "none",
      install: false,
      git: false,
      yes: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.database).toEqual({ kind: "none" });
  });

  it("selects a template and drops the stack questions", async () => {
    const result = await resolveInput("/tmp", "my-app", {
      template: "gpui-starter",
      install: false,
      git: false,
      yes: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.template).toBe("gpui-starter");
    expect(result.value.clients).toEqual([]);
    expect(result.value.backend).toEqual({ kind: "none" });
    expect(result.value.database).toEqual({ kind: "none" });
    expect(result.value.docker).toBe(false);
    expect(result.value.githubActions).toBe(false);
    expect(result.value.orchestrator).toBe("none");
  });

  it("defaults to no template when --yes is used without one", async () => {
    const result = await resolveInput("/tmp", "my-app", {
      install: false,
      git: false,
      yes: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.template).toBe("none");
    expect(result.value.clients).toEqual([{ kind: "expo" }]);
  });

  it("rejects stack-only options combined with a template", async () => {
    const result = await resolveInput("/tmp", "my-app", {
      template: "gpui-starter",
      docker: true,
      ci: "github",
      install: false,
      git: false,
      yes: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok || "message" in result.error) return;
    expect(result.error.map((issue) => issue.code)).toContain("template-unsupported-option");
  });

  it("rejects unknown templates", async () => {
    const result = await resolveInput("/tmp", "my-app", {
      template: "blazor",
      install: false,
      git: false,
      yes: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok || !("message" in result.error)) return;
    expect(result.error.message).toContain("Invalid template");
  });
});

describe("Planner", () => {
  it("orders dependencies before the generators that use them", () => {
    const plan = Planner.create(referenceConfig());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const ids = plan.value.generators.map((generator) => generator.id);
    for (const expected of ["root", "package-manager", "expo", "rust", "axum", "sqlx"] as const) {
      expect(ids).toContain(expected);
    }
    expect(ids.indexOf("root")).toBeLessThan(ids.indexOf("package-manager"));
    expect(ids.indexOf("package-manager")).toBeLessThan(ids.indexOf("expo"));
    expect(ids.indexOf("rust")).toBeLessThan(ids.indexOf("axum"));
    expect(ids.indexOf("axum")).toBeLessThan(ids.indexOf("sqlx"));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("orders install after providers and Git after install", () => {
    const plan = Planner.create({ ...referenceConfig(), install: true, initializeGit: true });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const ids = plan.value.generators.map((generator) => generator.id);
    const installIndex = ids.indexOf("install");
    const gitIndex = ids.indexOf("git");
    expect(installIndex).toBeGreaterThan(ids.indexOf("sqlx"));
    expect(gitIndex).toBeGreaterThan(installIndex);
  });

  it("plans a template as a self-contained scaffold", () => {
    const plan = Planner.create({
      ...referenceConfig(),
      template: "gpui-starter",
      clients: [],
      backend: { kind: "none" },
      database: { kind: "none" },
      docker: false,
      githubActions: false,
      install: true,
      initializeGit: true,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.value.generators.map((generator) => generator.id)).toEqual(["template", "template-install", "git"]);
  });

  it("plans only the template when build and Git are skipped", () => {
    const plan = Planner.create({
      ...referenceConfig(),
      template: "gpui-starter",
      clients: [],
      backend: { kind: "none" },
      database: { kind: "none" },
      docker: false,
      githubActions: false,
      install: false,
      initializeGit: false,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.value.generators.map((generator) => generator.id)).toEqual(["template"]);
  });
});
