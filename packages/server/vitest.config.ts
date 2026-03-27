import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    sequence: { concurrent: false },
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    include: ["src/services/**/*.test.ts", "src/__tests__/services/**/*.test.ts"],
    exclude: ["src/__tests__/api/**", "src/tests/**"],
    retry: 1,
  },
});
