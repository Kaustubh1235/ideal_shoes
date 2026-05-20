import type { Config } from "tailwindcss";
import preset from "@bharatboot/config/tailwind.preset.js";

const config: Config = {
  presets: [preset],
  content: [
    "./src/**/*.{ts,tsx,js,jsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
