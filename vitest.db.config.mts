import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Integration tests against a real Postgres: the Neon dev branch, from
 * DATABASE_URL in .secrets/dev.env (or the environment). They create their own
 * users and outages and delete them afterwards.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    setupFiles: ["tests/db/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One connection pool, shared rows: run the files one after another.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
});
