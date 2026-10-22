import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const base = process.env.PLAYTOOLS_PAGES_BASE ?? "/";

export default defineConfig({
  root: "github-pages",
  base,
  define: {
    global: "globalThis",
  },
  plugins: [react()],
  publicDir: "../public",
  build: {
    outDir: "../dist-pages",
    emptyOutDir: true,
  },
  worker: {
    format: "es",
  },
});
