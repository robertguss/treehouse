import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  plugins: [react()],
  // Games build into dist/site/games/<name>; the root build script cleans dist/site.
  build: { outDir: "../../dist/site", emptyOutDir: false },
  server: { proxy: { "/login": "http://localhost:8000", "/api": "http://localhost:8000" } },
});
