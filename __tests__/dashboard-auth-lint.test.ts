import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const DASHBOARD_API_DIR = path.resolve(__dirname, "../app/api/dashboard");

// Routes that are intentionally unprotected (auth endpoints)
const EXEMPT_ROUTES = new Set(["login", "logout"]);

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(full));
    } else if (entry.name === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

describe("dashboard API auth lint", () => {
  const routeFiles = findRouteFiles(DASHBOARD_API_DIR);

  it("finds at least 10 route files (sanity check)", () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of routeFiles) {
    const rel = path.relative(DASHBOARD_API_DIR, file);
    const topDir = rel.split(path.sep)[0];

    if (EXEMPT_ROUTES.has(topDir)) continue;

    it(`${rel} imports verifySessionToken`, () => {
      const src = fs.readFileSync(file, "utf-8");
      expect(src).toContain("verifySessionToken");
    });
  }
});
