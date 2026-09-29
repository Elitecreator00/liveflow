import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@liveflow/api-client": path.resolve(
        __dirname,
        "../../packages/api-client/src/index.ts",
      ),
      "@liveflow/design-system": path.resolve(
        __dirname,
        "../../packages/design-system/src/index.ts",
      ),
      // socket.io-client is a runtime dep of api-client; not needed in creator
      // but aliased to avoid resolution errors during test transforms
      "socket.io-client": path.resolve(
        __dirname,
        "../../apps/console/node_modules/socket.io-client",
      ),
    },
  },
});
