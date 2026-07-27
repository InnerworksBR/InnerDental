import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(fileURLToPath(new URL(".", import.meta.url)), "src"),
      "server-only": path.resolve(fileURLToPath(new URL(".", import.meta.url)), "tests/mocks/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
