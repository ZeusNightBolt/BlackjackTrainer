import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
    // the App smoke test opts into a DOM via a per-file @vitest-environment comment
    globals: true,
  },
});
