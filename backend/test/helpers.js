// Test harness: signs real RS256 tokens, serves a JWKS, and runs a fake PostgREST
// server so the real Supabase client and repository code are exercised end to end.

import { createServer } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createFirebaseVerifier } from '../src/auth/firebase.js';
import { createRepository } from '../src/db/repository.js';
import { createSupabase } from '../src/db/supabase.js';

export const PROJECT = 'recall-test';
export const ORIGIN = 'https://recall.example.app';

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

export function makeKeys(kid = 'k1') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } };
}

export function signToken(keys, overrides = {}, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'user-a',
    iat: now - 10,
    auth_time: now - 10,
    exp: now + 3600,
    email: 'a@example.com',
    name: 'Ada Lovelace',
    picture: 'https://example.com/a.png',
    ...overrides,
  };
  const h = b64({ alg: 'RS256', typ: 'JWT', kid: keys.kid, ...header });
  const p = b64(claims);
  const sig = sign('RSA-SHA256', Buffer.from(`${h}.${p}`), keys.privateKey).toString('base64url');
  return `${h}.${p}.${sig}`;
}

/** In-memory PostgREST subset: eq filters, order, limit, Range paging, count=exact, upsert, cascades. */
export function startFakePostgrest(serviceKey = 'service-key') {
  const tables = { profiles: [], decks: [], cards: [], study_sessions: [] };
  const log = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const table = url.pathname.replace('/rest/v1/', '');
    log.push(`${req.method} ${table}?${url.searchParams}`);
    if (req.headers.apikey !== serviceKey || req.headers.authorization !== `Bearer ${serviceKey}`) {
      res.writeHead(401).end('{"message":"bad key"}');
      return;
    }
    const rows = tables[table];
    if (!rows) return void res.writeHead(404).end('{}');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined;
    const prefer = req.headers.prefer || '';
    const reserved = new Set(['select', 'order', 'limit', 'on_conflict']);
    const matches = (row) => [...url.searchParams].every(([k, v]) => reserved.has(k) || String(row[k]) === v.replace(/^eq\./, ''));
    const out = (status, data, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(req.method === 'HEAD' ? '' : JSON.stringify(data));
    };
    const defaults = (t, row) => ({
      created_at: new Date().toISOString(),
      ...(t === 'cards' ? { interval_days: 0, due_at: null, seen_count: 0, correct_count: 0 } : {}),
      ...(t === 'decks' ? { subject: 'General', icon: 'layers-2' } : {}),
      ...(t === 'study_sessions' ? { id: crypto.randomUUID() } : {}),
      ...row,
    });
    const cascade = (t, removed) => {
      const ids = new Set(removed.map((r) => r.id));
      if (t === 'profiles') {
        for (const child of ['decks', 'cards', 'study_sessions']) tables[child] = tables[child].filter((r) => !ids.has(r.user_id));
      }
      if (t === 'decks') tables.cards = tables.cards.filter((r) => !ids.has(r.deck_id));
    };

    if (req.method === 'GET' || req.method === 'HEAD') {
      let result = rows.filter(matches);
      const order = url.searchParams.get('order');
      if (order) {
        const [col, dir] = order.split('.');
        result.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      const total = result.length;
      const range = req.headers.range?.match(/^(\d+)-(\d+)$/);
      if (range) result = result.slice(Number(range[1]), Number(range[2]) + 1);
      const lim = url.searchParams.get('limit');
      if (lim) result = result.slice(0, Number(lim));
      return out(200, result, { 'Content-Range': `${result.length ? `0-${result.length - 1}` : '*'}/${total}` });
    }
    if (req.method === 'POST') {
      const conflictCol = url.searchParams.get('on_conflict');
      if (prefer.includes('merge-duplicates')) {
        const i = rows.findIndex((r) => r[conflictCol] === body[conflictCol]);
        if (i >= 0) return out(201, [(rows[i] = { ...rows[i], ...body })]);
      } else if (body.id && rows.some((r) => r.id === body.id)) {
        return out(409, { code: '23505', message: 'duplicate key' });
      }
      const row = defaults(table, body);
      if (table === 'cards' && !tables.decks.some((d) => d.id === row.deck_id)) return out(409, { code: '23503' });
      rows.push(row);
      return out(201, [row]);
    }
    if (req.method === 'PATCH') {
      const hit = rows.filter(matches);
      hit.forEach((r) => Object.assign(r, body));
      return out(200, hit);
    }
    if (req.method === 'DELETE') {
      const hit = rows.filter(matches);
      tables[table] = rows.filter((r) => !hit.includes(r));
      cascade(table, hit);
      return out(200, hit);
    }
    out(405, {});
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${server.address().port}`, tables, log, stop: () => server.close() }),
    ),
  );
}

export async function startStack({ rateLimitPerMin = 1000, maxDecks = 100, maxCards = 1000, corsOrigins = [ORIGIN], port = 0 } = {}) {
  const keys = makeKeys();
  const pg = await startFakePostgrest();
  const fetchJwks = async () =>
    new Response(JSON.stringify({ keys: [keys.jwk] }), { headers: { 'cache-control': 'max-age=3600' } });
  const config = {
    env: 'test', firebaseProjectId: PROJECT, corsOrigins, rateLimitPerMin,
    supabaseUrl: pg.url, supabaseServiceKey: 'service-key',
  };
  const db = createSupabase({ url: pg.url, serviceKey: 'service-key' });
  const repo = createRepository(db, { maxDecks, maxCards });
  const app = createApp({ config, verifyIdToken: createFirebaseVerifier({ projectId: PROJECT, fetchImpl: fetchJwks }), repo });
  const server = createServer(app.handle);
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, { token, body, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
  const tokenFor = (sub, extra = {}) => signToken(keys, { sub, email: `${sub}@example.com`, ...extra });
  const stop = () => { app.stop(); server.close(); pg.stop(); };
  return { call, keys, pg, tokenFor, stop };
}
