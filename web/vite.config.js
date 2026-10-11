import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development, proxy to the Docker Compose services (API on :8000, TiTiler on :8080).
export default defineConfig({
  plugins: [react()],
  // MapLibre is large; keep it in its own long-cached chunk.
  build: { rollupOptions: { output: { manualChunks: { maplibre: ["maplibre-gl"] } } }, chunkSizeWarningLimit: 1100 },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/tiles": { target: "http://localhost:8080", rewrite: (p) => p.replace(/^\/tiles/, "") },
    },
  },
});
