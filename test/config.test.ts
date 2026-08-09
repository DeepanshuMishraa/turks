import path from "node:path";
import { describe, expect, it } from "vitest";
import { StackConfig, type StackConfig as StackConfigValue } from "../src/core/config.js";
import { Planner } from "../src/core/planner.js";
import { resolveInput } from "../src/cli/input.js";

function referenceConfig(): StackConfigValue {
  return {
    projectName: "my-app",
    destination: "/tmp/my-app",
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
});

describe("Planner", () => {
  it("orders dependencies before the generators that use them", () => {
    const plan = Planner.create(referenceConfig());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const ids = plan.value.generators.map((generator) => generator.id);
    for (const expected of ["root", "pnpm", "expo", "rust", "axum", "sqlx"] as const) {
      expect(ids).toContain(expected);
    }
    expect(ids.indexOf("root")).toBeLessThan(ids.indexOf("pnpm"));
    expect(ids.indexOf("pnpm")).toBeLessThan(ids.indexOf("expo"));
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
});
