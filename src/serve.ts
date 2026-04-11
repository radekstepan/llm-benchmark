#!/usr/bin/env node
/**
 * Production server — serve built web assets and API endpoint.
 * Usage: node dist/serve.js [port]  (default: 4000)
 *
 * For development, use: npm run dev (Vite dev server with hot reload)
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const PORT = parseInt(process.argv[2] ?? process.env.PORT ?? '4000', 10);
const WEB_DIR = join(process.cwd(), 'dist-web');

function readResults(): string {
  const p = join(process.cwd(), 'results', 'benchmarks.json');
  return existsSync(p) ? readFileSync(p, 'utf-8') : '{"models":[]}';
}

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

  // API endpoint
  if (req.url === '/api/results') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(readResults());
    return;
  }

  // Static files - serve from dist-web/
  let url = req.url ?? '/';
  if (url === '/' || url === '') url = '/index.html';

  const filePath = join(WEB_DIR, url);
  const ext = extname(filePath);

  if (!existsSync(filePath)) {
    // Try index.html for SPA routing
    const indexPath = join(WEB_DIR, 'index.html');
    if (existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(indexPath));
    } else {
      res.writeHead(404);
      res.end('Not found. Run npm run build:web first.');
    }
    return;
  }

  const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
  res.end(readFileSync(filePath));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`
  ┌────────────────────────────────────────────────
  │  LLM Benchmark Results (production)
  │  http://localhost:${PORT}
  │
  │  For dev mode with hot reload: npm run dev
  └────────────────────────────────────────────────
`);
});