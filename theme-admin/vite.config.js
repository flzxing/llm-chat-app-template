import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/theme-admin/",
  build: {
    outDir: "../public/theme-admin",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/v1": "https://luckyaitool.com",
      "/assets": "https://luckyaitool.com",
    },
  },
  preview: {
    proxy: {
      "/v1": "https://luckyaitool.com",
      "/assets": "https://luckyaitool.com",
    },
  },
});
