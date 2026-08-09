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
    expect(result.value.destination).toBe("/tmp/Current Project");
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
});

describe("Planner", () => {
  it("orders dependencies before the generators that use them", () => {
    const plan = Planner.create(referenceConfig());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const ids = plan.value.generators.map((generator) => generator.id);
    expect(ids.indexOf("root")).toBeLessThan(ids.indexOf("pnpm"));
    expect(ids.indexOf("pnpm")).toBeLessThan(ids.indexOf("expo"));
    expect(ids.indexOf("rust")).toBeLessThan(ids.indexOf("axum"));
    expect(ids.indexOf("axum")).toBeLessThan(ids.indexOf("sqlx"));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
