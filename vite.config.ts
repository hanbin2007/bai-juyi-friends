import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://hanbin2007.github.io/bai-juyi-friends/
export default defineConfig({
  base: "/bai-juyi-friends/",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 },
});
