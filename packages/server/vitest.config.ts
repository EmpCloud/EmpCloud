import { defineConfig } from "vitest/config";

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
  },
});
