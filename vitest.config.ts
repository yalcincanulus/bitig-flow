import { fileURLToPath } from "node:url";
import { defineConfig, defineProject } from "vitest/config";

const sourceDirectory = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "#": sourceDirectory,
    },
  },
  test: {
    projects: [
      defineProject({
        test: {
          name: "pure",
          environment: "node",
          include: ["tests/pure/**/*.test.ts"],
        },
      }),
      defineProject({
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["./tests/integration/global-setup.ts"],
          setupFiles: ["./tests/integration/setup.ts"],
          pool: "threads",
          fileParallelism: false,
          maxWorkers: 1,
        },
      }),
    ],
  },
});
