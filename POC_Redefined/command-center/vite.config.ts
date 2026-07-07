import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      // Forward /api/* to the local Python report API (local_api.py on port 5050).
      '/api': {
        target: 'http://127.0.0.1:5050',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  plugins: [
    react(),
    // Serve the Python report outputs at /runs/** so the React app can fetch them.
    // The runs/ directory lives one level up from command-center/ (i.e. POC_Redefined/runs/).
    {
      name: 'serve-runs',
      configureServer(server) {
        server.middlewares.use('/runs', (req, res, next) => {
          const filePath = path.join(__dirname, '../runs', req.url ?? '')
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath)
            const mime = ext === '.json' ? 'application/json'
                       : ext === '.csv'  ? 'text/csv'
                       : 'application/octet-stream'
            res.setHeader('Content-Type', mime)
            res.setHeader('Cache-Control', 'no-store')
            res.end(fs.readFileSync(filePath))
          } else {
            next()
          }
        })
      },
    },
  ],
})
