import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("package exports", () => {
  it("maps ESM and CommonJS runtimes to matching declaration formats", async () => {
    const contents = await readFile(path.resolve("package.json"), "utf8");
    const manifest: unknown = JSON.parse(contents);
    expect(isRecord(manifest)).toBe(true);
    if (!isRecord(manifest) || !isRecord(manifest.exports) || !isRecord(manifest.exports["."])) return;

    const rootExport = manifest.exports["."];
    expect(rootExport.import).toEqual({ types: "./dist/index.d.ts", default: "./dist/index.js" });
    expect(rootExport.require).toEqual({ types: "./dist/index.d.cts", default: "./dist/index.cjs" });
  });
});
