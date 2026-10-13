import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // Forward /api requests to the GameScope API (GameReview/api.py)
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
