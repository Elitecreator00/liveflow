import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    tokens: "src/tokens.ts",
    "tailwind-preset": "src/tailwind-preset.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "tailwindcss"],
  treeshake: true,
});
