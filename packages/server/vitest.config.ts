import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "path";

// Load .env from project root so DB_PASSWORD and other secrets are available
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    sequence: { concurrent: false },
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    include: ["src/__tests__/**/*.test.ts"],
    exclude: ["src/tests/**"],
    retry: 1,
    coverage: {
      provider: "v8",
      all: true,
      reportOnFailure: true,
      include: ["src/services/**/*.ts", "src/utils/**/*.ts", "src/api/middleware/**/*.ts"],
      exclude: ["src/__tests__/**", "tests/**", "src/db/migrations/**", "src/db/seeds/**"],
      reporter: ["text", "text-summary", "json"],
      reportsDirectory: "./coverage",
    },
  },
});
