import { fileURLToPath } from "node:url";
import { defineConfig, defineProject } from "vitest/config";

const sourceDirectory = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  test: {
    projects: [
      defineProject({
        resolve: {
          alias: {
            "#": sourceDirectory,
          },
        },
        test: {
          name: "pure",
          environment: "node",
          include: ["tests/pure/**/*.test.ts"],
        },
      }),
    ],
  },
});
