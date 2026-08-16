import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on LAN so you can test on a phone against `npm run dev`
    port: 5173,
    proxy: {
      // forwards /api/* to the Flask dev server so the frontend can just
      // fetch("/api/...") without worrying about CORS/ports in dev
      "/api": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
      },
    },
  },
});
