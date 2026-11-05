import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/finance/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});

