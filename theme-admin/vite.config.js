import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/theme-admin/",
  build: {
    outDir: "../public/theme-admin",
    emptyOutDir: true,
  },
});
