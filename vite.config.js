import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" keeps asset paths relative so the build works on GitHub Pages
// (project sites served at /<repo>/), Netlify, or opened as a static file.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
