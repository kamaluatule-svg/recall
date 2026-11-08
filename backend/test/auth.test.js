import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { ORIGIN, makeKeys, signToken, startStack } from './helpers.js';

let s;
before(async () => { s = await startStack(); });
after(() => s.stop());

test('health is public', async () => {
  const r = await s.call('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
});

test('protected routes reject missing and malformed credentials', async () => {
  assert.equal((await s.call('GET', '/api/v1/bootstrap')).status, 401);
  assert.equal((await s.call('GET', '/api/v1/bootstrap', { token: 'not.a.jwt' })).status, 401);
  assert.equal((await s.call('GET', '/api/v1/bootstrap', { headers: { Authorization: 'Basic abc' } })).status, 401);
});

test('rejects bad signature, expired, wrong audience, wrong issuer', async () => {
  const other = makeKeys('k1'); // same kid, different key => bad signature
  const now = Math.floor(Date.now() / 1000);
  const cases = {
    'bad signature': signToken(other),
    expired: signToken(s.keys, { exp: now - 600, iat: now - 4000, auth_time: now - 4000 }),
    'wrong audience': signToken(s.keys, { aud: 'other-project' }),
    'wrong issuer': signToken(s.keys, { iss: 'https://evil.example/recall-test' }),
    'unknown kid': signToken(s.keys, {}, { kid: 'nope' }),
    'alg none': `${Buffer.from('{"alg":"none","kid":"k1"}').toString('base64url')}.${Buffer.from('{"sub":"x"}').toString('base64url')}.`,
  };
  for (const [name, token] of Object.entries(cases)) {
    assert.equal((await s.call('GET', '/api/v1/bootstrap', { token })).status, 401, name);
  }
});

test('accepts a valid token and creates the profile', async () => {
  const r = await s.call('GET', '/api/v1/bootstrap', { token: s.tokenFor('user-a') });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.decks, []);
  assert.equal(r.body.user.id, 'user-a');
  assert.equal(s.pg.tables.profiles.find((p) => p.id === 'user-a').email, 'user-a@example.com');
});

test('CORS: allowed origin is echoed, others get no headers, preflight works', async () => {
  const ok = await s.call('OPTIONS', '/api/v1/decks', { headers: { Origin: ORIGIN } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  const bad = await s.call('OPTIONS', '/api/v1/decks', { headers: { Origin: 'https://evil.example' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});

test('rate limiter returns 429 with Retry-After', async () => {
  const limited = await startStack({ rateLimitPerMin: 5 });
  try {
    let last;
    for (let i = 0; i < 8; i++) last = await limited.call('GET', '/health');
    assert.equal(last.status, 429);
    assert.ok(Number(last.headers.get('retry-after')) > 0);
  } finally {
    limited.stop();
  }
});
