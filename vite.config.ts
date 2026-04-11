import { defineConfig } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Read benchmark results from JSON file
function readResults(): string {
  const p = join(process.cwd(), 'results', 'benchmarks.json');
  return existsSync(p) ? readFileSync(p, 'utf-8') : '{"models":[]}';
}

// Vite plugin to handle API requests
function apiPlugin() {
  return {
    name: 'llm-benchmark-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method === 'GET' && req.url === '/api/results') {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(readResults());
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  root: 'web',
  plugins: [apiPlugin()],
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
  },
  server: {
    port: 4000,
    open: true,
  },
});