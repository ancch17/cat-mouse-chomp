'use strict';
// Zero-dependency static file server + leaderboard API for Cat & Mouse Chomp.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');

// Leaderboard storage. Set DATA_DIR to a mounted volume path on Railway
// (e.g. /data) if you want scores to survive redeploys.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const LB_FILE = path.join(DATA_DIR, 'leaderboard.json');
const LB_MAX = 7;

let leaderboard = [];
try {
  const parsed = JSON.parse(fs.readFileSync(LB_FILE, 'utf8'));
  if (Array.isArray(parsed)) {
    leaderboard = parsed
      .sort((a, b) => b.score - a.score)
      .slice(0, LB_MAX); // trim boards saved under the old, larger cap
  }
} catch { /* no saved board yet */ }

function persistLeaderboard() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard));
  } catch (err) {
    console.error('Could not persist leaderboard:', err.message);
  }
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function handleLeaderboard(req, res) {
  if (req.method === 'GET') return sendJson(res, 200, leaderboard);

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2048) { req.destroy(); }
    });
    req.on('end', () => {
      let entry;
      try { entry = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'bad json' }); }
      const name = String((entry && entry.name) || '')
        .replace(/[^ -~]/g, '')
        .trim().slice(0, 12) || 'MOUSE';
      const score = Math.floor(Number(entry && entry.score));
      if (!Number.isFinite(score) || score < 0 || score > 99999999) {
        return sendJson(res, 400, { error: 'bad score' });
      }
      const level = Math.min(Math.max(Math.floor(Number(entry && entry.level)) || 1, 1), 999);
      leaderboard.push({ name, level, score });
      leaderboard.sort((a, b) => b.score - a.score);
      leaderboard = leaderboard.slice(0, LB_MAX);
      persistLeaderboard();
      return sendJson(res, 200, leaderboard);
    });
    return;
  }

  sendJson(res, 405, { error: 'method not allowed' });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400); return res.end('Bad request');
  }

  if (pathname === '/api/leaderboard') return handleLeaderboard(req, res);

  if (pathname === '/') pathname = '/index.html';

  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      // HTML revalidates so deploys show up immediately; js/css cache briefly.
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=600'
    };
    const compressible = /^text\/|json|javascript|svg/.test(type);
    const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (compressible && acceptsGzip) {
      zlib.gzip(data, (gzErr, gz) => {
        if (gzErr) { res.writeHead(200, headers); return res.end(data); }
        headers['Content-Encoding'] = 'gzip';
        headers['Vary'] = 'Accept-Encoding';
        res.writeHead(200, headers);
        res.end(gz);
      });
    } else {
      res.writeHead(200, headers);
      res.end(data);
    }
  });
}).listen(PORT, () => {
  console.log(`Cat & Mouse Chomp running on port ${PORT}`);
});
