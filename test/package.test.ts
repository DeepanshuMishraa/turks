import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

describe("package exports", () => {
  it("maps ESM and CommonJS runtimes to matching declaration formats", async () => {
    const contents = await readFile(path.resolve("package.json"), "utf8");
    const manifest = requireRecord(JSON.parse(contents), "package.json");
    const exports = requireRecord(manifest.exports, "package.json exports");
    const rootExport = requireRecord(exports["."], "package.json root export");
    expect(rootExport.import).toEqual({ types: "./dist/index.d.ts", default: "./dist/index.js" });
    expect(rootExport.require).toEqual({ types: "./dist/index.d.cts", default: "./dist/index.cjs" });
  });
});
