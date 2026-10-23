import { defineConfig } from "vitest/config";

export default defineConfig({
  // Lets tests import "@/lib/..." just like the app does (paths from tsconfig.json).
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts"],
    environment: "node",
  },
});
