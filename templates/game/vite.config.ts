import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const server = "http://localhost:8000";

export default defineConfig({
  base: "/games/__NAME__/",
  plugins: [react()],
  build: {
    outDir: "../../dist/site/games/__NAME__",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    proxy: {
      "/ws": { target: "ws://localhost:8000", ws: true },
      "/api": server,
      "/lib": server,
      "/login": server,
    },
  },
});
