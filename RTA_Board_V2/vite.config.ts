import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// /api/* -> local_api.py (POC_Redefined, port 5050). /runs/* serves its outputs (the reports read runs/reports/*.json).
export default defineConfig({
  plugins: [
    react(),
    {
      name: "serve-runs",
      configureServer(server) {
        const root = path.resolve(__dirname, "../POC_Redefined/runs");
        server.middlewares.use("/runs", (req, res, next) => {
          const file = path.join(root, decodeURIComponent((req.url ?? "").split("?")[0]));
          if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
          res.setHeader("Content-Type", file.endsWith(".json") ? "application/json" : file.endsWith(".csv") ? "text/csv" : "application/octet-stream");
          res.setHeader("Cache-Control", "no-store");
          res.end(fs.readFileSync(file));
        });
      },
    },
  ],
  server: { port: 5174, proxy: { "/api": { target: "http://127.0.0.1:5050", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } } },
});
