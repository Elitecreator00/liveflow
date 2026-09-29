import type { Config } from "tailwindcss";
import liveflowPreset from "@liveflow/design-system/tailwind-preset";

const config: Config = {
  presets: [liveflowPreset],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/design-system/src/**/*.{ts,tsx}",
  ],
};

export default config;
