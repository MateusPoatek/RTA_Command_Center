import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api/* -> local_api.py (POC_Redefined, port 5050), same as the command-center.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: { "/api": { target: "http://127.0.0.1:5050", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } } },
});
