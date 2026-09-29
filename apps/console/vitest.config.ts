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
      // socket.io-client is a runtime dep of api-client; resolve it from this app
      "socket.io-client": path.resolve(
        __dirname,
        "node_modules/socket.io-client",
      ),
    },
  },
});
