// Builds the HTTP request handler. Dependencies are injected so tests can swap
// Firebase verification and the database without touching the network.

import { HttpError, notFound, readJson, sendJson, unauthorized } from './lib/http.js';
import { createRateLimiter } from './lib/rateLimit.js';
import { buildRouter } from './routes/index.js';

export function createApp({ config, verifyIdToken, repo, now = Date.now }) {
  const router = buildRouter(repo);
  const limiter = createRateLimiter({ limit: config.rateLimitPerMin, now });
  const allowed = new Set(config.corsOrigins);

  const clientIp = (req) =>
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

  function corsHeaders(req) {
    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) return {};
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    };
  }

  async function handle(req, res) {
    const started = now();
    const cors = corsHeaders(req);
    const reply = (status, body, extra) => sendJson(res, status, body, { ...cors, ...extra });
    let uid;
    let status = 500;

    try {
      const path = new URL(req.url, 'http://x').pathname;

      if (req.method === 'OPTIONS') {
        status = 204;
        res.writeHead(204, cors);
        return res.end();
      }

      const rate = limiter.check(clientIp(req));
      if (!rate.ok) {
        status = 429;
        return reply(429, { error: { code: 'rate_limited', message: 'Too many requests' } }, { 'Retry-After': String(rate.retryAfterSec) });
      }

      const match = router.match(req.method, path);
      if (!match) throw notFound('Route not found');
      if (match.methodNotAllowed) throw new HttpError(405, 'method_not_allowed', 'Method not allowed');

      const { route, params } = match;
      let user = null;
      if (route.auth) {
        const header = req.headers.authorization || '';
        if (!header.startsWith('Bearer ')) throw unauthorized();
        user = await verifyIdToken(header.slice(7));
        uid = user.uid;
        await repo.ensureProfile(user);
      }

      const hasBody = req.method === 'POST' || req.method === 'PATCH';
      const body = hasBody ? await readJson(req) : undefined;
      const result = await route.handler({ user, params, body });
      status = result.status;
      reply(result.status, result.body);
    } catch (err) {
      const known = err instanceof HttpError;
      status = known ? err.status : 500;
      if (!known) console.error(JSON.stringify({ level: 'error', msg: 'unhandled', error: String(err), stack: err?.stack }));
      reply(status, {
        error: {
          code: known ? err.code : 'internal_error',
          message: known ? err.message : 'Something went wrong',
          ...(known && err.details ? { details: err.details } : {}),
        },
      });
    } finally {
      if (config.env !== 'test') {
        console.log(JSON.stringify({ level: 'info', method: req.method, url: req.url.split('?')[0], status, ms: now() - started, uid }));
      }
    }
  }

  return { handle, stop: () => limiter.stop() };
}
