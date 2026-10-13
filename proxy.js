// Tiny local relay for the 99acres -> Bliss Realty CRM integration tester.
// Run:  node proxy.js        (needs Node 18+)   then open http://localhost:3000
//
// Why this exists: browsers block direct calls to api.realestatecrm.cloud unless that
// server sends CORS headers. This relay calls the API server-to-server (no CORS) and
// keeps the API key out of the browser. Override via env: API_KEY, API_URL, PORT.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'https://api.realestatecrm.cloud/api/v1/integration/99acres';
const API_KEY = process.env.API_KEY || 'ulxmJpPhlHLTusO9RJiYqAzmCxKlPsJApN-pjilXnio';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function relay(envelope) {
  const { method = 'POST', rawBody = '', keyMode = 'default', key = '', contentType = 'application/json' } = envelope;
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  if (keyMode === 'default') headers['API-Key'] = API_KEY;
  else if (keyMode === 'custom') headers['API-Key'] = key;
  // keyMode === 'none' -> header omitted on purpose

  const init = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') init.body = rawBody;

  const t0 = Date.now();
  try {
    const r = await fetch(API_URL, init);
    const text = await r.text();
    return {
      via: 'proxy',
      status: r.status,
      statusText: r.statusText,
      elapsedMs: Date.now() - t0,
      contentType: r.headers.get('content-type') || '',
      bodyText: text,
      corsHeader: r.headers.get('access-control-allow-origin') || null,
    };
  } catch (e) {
    return {
      via: 'proxy',
      status: 0,
      elapsedMs: Date.now() - t0,
      error: e.message,
      errorCode: (e.cause && (e.cause.code || e.cause.message)) || e.code || null,
    };
  }
}

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/relay') {
    try {
      const envelope = JSON.parse(await readBody(req));
      const out = await relay(envelope);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ via: 'proxy', status: 0, error: 'Bad relay request: ' + e.message }));
    }
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    return;
  }
  res.writeHead(404); res.end('Not found');
}).listen(PORT, () => {
  console.log(`Tester running:  http://localhost:${PORT}`);
  console.log(`Relaying to:     ${API_URL}`);
});
