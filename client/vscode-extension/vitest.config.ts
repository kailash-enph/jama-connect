import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,           // vi.fn() available without imports
    environment: "node",
    alias: {
      // Redirect all 'vscode' imports to our stub
      vscode: new URL("./src/__tests__/mocks/vscode.ts", import.meta.url).pathname,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "src/webview/**"],
    },
  },
});
