import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/lib/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws when bundled for the client; Vitest never does
      // that, so resolve it to an empty stub instead of installing the pkg.
      "server-only": fileURLToPath(
        new URL("./src/lib/test-stubs/server-only.ts", import.meta.url),
      ),
    },
  },
});
