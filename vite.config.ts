import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command, isPreview }) => ({
  // Project Pages hosts this app under /feint-iq/, while local development stays at /.
  base: command === "build" || isPreview ? "/feint-iq/" : "/",
  plugins: [react()],
  test: { include: ["src/**/*.test.ts"] },
}));
