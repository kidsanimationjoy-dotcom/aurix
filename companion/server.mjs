// AURIX local companion — foundation build.
// Binds to loopback only. Implements ONE authenticated read-only endpoint (/v1/health).
// It has NO filesystem or terminal access yet; those are designed in src/companion/protocol.ts.
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const VERSION = '0.1.0';

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createCompanionServer({ token, origin }) {
  return http.createServer((req, res) => {
    const reqOrigin = req.headers.origin;
    const cors = {};
    if (reqOrigin && reqOrigin === origin) {
      cors['Access-Control-Allow-Origin'] = origin;
      cors['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
      cors['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
      cors['Access-Control-Allow-Private-Network'] = 'true';
      cors['Vary'] = 'Origin';
    }
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

    const url = new URL(req.url ?? '/', 'http://localhost');
    const auth = req.headers.authorization ?? '';
    const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!safeEqual(given, token)) return send(401, { error: 'UNAUTHORIZED' });

    if (req.method === 'GET' && url.pathname === '/v1/health') {
      return send(200, {
        service: 'aurix-companion',
        apiVersion: 1,
        version: VERSION,
        capabilities: ['health'],
        grantedRoots: [],
      });
    }
    return send(501, { error: 'NOT_IMPLEMENTED', message: 'This companion build only implements /v1/health.' });
  });
}

// CLI entry
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const token = process.env.AURIX_COMPANION_TOKEN || randomBytes(24).toString('base64url');
  const origin = process.env.AURIX_ORIGIN || 'http://localhost:5173';
  const port = Number(process.env.AURIX_COMPANION_PORT || 4317);
  createCompanionServer({ token, origin }).listen(port, '127.0.0.1', () => {
    console.log(`AURIX companion ${VERSION} listening on http://127.0.0.1:${port}`);
    console.log(`Allowed origin: ${origin}`);
    console.log(`Pairing token:  ${token}`);
    console.log('Capabilities: health only (no filesystem or terminal access in this build).');
  });
}
