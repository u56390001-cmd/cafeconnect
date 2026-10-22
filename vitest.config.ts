import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "evaluations/**/*.test.ts"],
    // The evaluation suite is excluded from the default run so unit tests stay
    // fast; `npm run eval` runs it on its own with a full report.
    exclude: ["**/node_modules/**"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
