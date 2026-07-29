#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    const path = join(dist, new URL(req.url, 'http://x').pathname);
    if (!path.startsWith(dist)) {
      res.writeHead(403);
      res.end();
      return;
    }
    let file = path;
    let body;
    try {
      body = await readFile(file);
    } catch {
      file = join(dist, 'index.html');
      body = await readFile(file);
    } // SPA fallback
    res.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
    });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end(
      'Variorum: dist/index.html not found — was the package built before packing?',
    );
  }
});

const port = Number(process.env.PORT ?? 5177);
server.listen(port, '127.0.0.1', () => {
  console.log(`Variorum running at http://localhost:${port}`);
});
