import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startStack } from './helpers.js';
import { nextSchedule } from '../src/services/scheduler.js';

let s, A, B;
before(async () => {
  s = await startStack({ maxDecks: 3, maxCards: 3 });
  A = s.tokenFor('user-a');
  B = s.tokenFor('user-b');
});
after(() => s.stop());

const deckBody = { name: 'Cell Biology', subject: 'Biology', icon: 'dna' };

test('deck + card lifecycle round-trips through bootstrap', async () => {
  const d = await s.call('POST', '/api/v1/decks', { token: A, body: deckBody });
  assert.equal(d.status, 201);
  assert.equal(d.body.name, 'Cell Biology');

  const c = await s.call('POST', `/api/v1/decks/${d.body.id}/cards`, { token: A, body: { q: 'Powerhouse?', a: 'Mitochondria' } });
  assert.equal(c.status, 201);
  assert.deepEqual([c.body.q, c.body.a, c.body.interval, c.body.due, c.body.seen, c.body.right], ['Powerhouse?', 'Mitochondria', 0, 0, 0, 0]);

  const patched = await s.call('PATCH', `/api/v1/cards/${c.body.id}`, { token: A, body: { a: 'The mitochondrion' } });
  assert.equal(patched.body.a, 'The mitochondrion');
  assert.equal(patched.body.q, 'Powerhouse?');

  const boot = await s.call('GET', '/api/v1/bootstrap', { token: A });
  assert.equal(boot.body.decks.length, 1);
  assert.equal(boot.body.decks[0].cards[0].a, 'The mitochondrion');

  assert.equal((await s.call('DELETE', `/api/v1/cards/${c.body.id}`, { token: A })).status, 204);
  assert.equal((await s.call('DELETE', `/api/v1/decks/${d.body.id}`, { token: A })).status, 204);
  assert.equal((await s.call('GET', '/api/v1/bootstrap', { token: A })).body.decks.length, 0);
});

test('client-supplied ids are honoured; duplicates conflict', async () => {
  const id = crypto.randomUUID();
  const ok = await s.call('POST', '/api/v1/decks', { token: A, body: { ...deckBody, id } });
  assert.equal(ok.body.id, id);
  assert.equal((await s.call('POST', '/api/v1/decks', { token: A, body: { ...deckBody, id } })).status, 409);
  await s.call('DELETE', `/api/v1/decks/${id}`, { token: A });
});

test('validation returns 422 with field errors', async () => {
  const r = await s.call('POST', '/api/v1/decks', { token: A, body: { name: '', icon: 'rocket' } });
  assert.equal(r.status, 422);
  assert.ok(r.body.error.details.name && r.body.error.details.icon);
  const long = await s.call('POST', '/api/v1/decks', { token: A, body: { name: 'x'.repeat(49) } });
  assert.equal(long.status, 422);
  assert.equal((await s.call('PATCH', `/api/v1/decks/${crypto.randomUUID()}`, { token: A, body: {} })).status, 422);
  assert.equal((await s.call('POST', '/api/v1/sessions', { token: A, body: { day: 'today', reviewed: 3, correct: 5 } })).status, 422);
});

test('non-JSON and oversized bodies are rejected', async () => {
  const wrongType = await s.call('POST', '/api/v1/decks', { token: A, headers: { 'Content-Type': 'text/plain' }, body: deckBody });
  assert.equal(wrongType.status, 415);
  const big = await s.call('POST', '/api/v1/decks', { token: A, body: { name: 'x', pad: 'y'.repeat(40_000) } });
  assert.equal(big.status, 413);
});

test('tenant isolation: user B cannot read or change user A data', async () => {
  const d = (await s.call('POST', '/api/v1/decks', { token: A, body: deckBody })).body;
  const c = (await s.call('POST', `/api/v1/decks/${d.id}/cards`, { token: A, body: { q: 'q', a: 'a' } })).body;

  assert.equal((await s.call('GET', '/api/v1/bootstrap', { token: B })).body.decks.length, 0);
  assert.equal((await s.call('PATCH', `/api/v1/decks/${d.id}`, { token: B, body: { name: 'hacked' } })).status, 404);
  assert.equal((await s.call('DELETE', `/api/v1/decks/${d.id}`, { token: B })).status, 404);
  assert.equal((await s.call('POST', `/api/v1/decks/${d.id}/cards`, { token: B, body: { q: 'x', a: 'y' } })).status, 404);
  assert.equal((await s.call('PATCH', `/api/v1/cards/${c.id}`, { token: B, body: { q: 'hacked' } })).status, 404);
  assert.equal((await s.call('POST', `/api/v1/cards/${c.id}/review`, { token: B, body: { correct: true } })).status, 404);
  assert.equal((await s.call('DELETE', `/api/v1/cards/${c.id}`, { token: B })).status, 404);

  const still = (await s.call('GET', '/api/v1/bootstrap', { token: A })).body.decks[0];
  assert.equal(still.name, 'Cell Biology');
  assert.equal(still.cards[0].q, 'q');
  await s.call('DELETE', `/api/v1/decks/${d.id}`, { token: A });
});

test('review applies the spaced-repetition schedule on the server', async () => {
  const d = (await s.call('POST', '/api/v1/decks', { token: A, body: deckBody })).body;
  const c = (await s.call('POST', `/api/v1/decks/${d.id}/cards`, { token: A, body: { q: 'q', a: 'a' } })).body;
  const intervals = [];
  for (let i = 0; i < 7; i++) {
    const r = await s.call('POST', `/api/v1/cards/${c.id}/review`, { token: A, body: { correct: true } });
    intervals.push(r.body.interval);
  }
  assert.deepEqual(intervals, [1, 2, 4, 8, 16, 30, 30]);

  const miss = (await s.call('POST', `/api/v1/cards/${c.id}/review`, { token: A, body: { correct: false } })).body;
  assert.equal(miss.interval, 0);
  assert.equal(miss.seen, 8);
  assert.equal(miss.right, 7);
  const minutes = (miss.due - Date.now()) / 60000;
  assert.ok(minutes > 9 && minutes <= 10.1, `due in ~10 min, got ${minutes}`);
  assert.equal((await s.call('POST', `/api/v1/cards/${c.id}/review`, { token: A, body: { correct: 'yes' } })).status, 422);
  await s.call('DELETE', `/api/v1/decks/${d.id}`, { token: A });
});

test('scheduler is a pure function', () => {
  const t = Date.UTC(2026, 0, 1);
  const r = nextSchedule({ interval_days: 0, seen_count: 0, correct_count: 0 }, true, t);
  assert.equal(r.interval_days, 1);
  assert.equal(r.due_at, new Date(t + 86_400_000).toISOString());
});

test('sessions are stored and returned oldest-first', async () => {
  const user = s.tokenFor('user-s');
  await s.call('POST', '/api/v1/sessions', { token: user, body: { day: '2026-10-7', reviewed: 4, correct: 3 } });
  await new Promise((r) => setTimeout(r, 5));
  await s.call('POST', '/api/v1/sessions', { token: user, body: { day: '2026-10-8', reviewed: 6, correct: 6 } });
  const boot = await s.call('GET', '/api/v1/bootstrap', { token: user });
  assert.deepEqual(boot.body.sessions.map((x) => x.day), ['2026-10-7', '2026-10-8']);
});

test('quotas cap decks per user and cards per deck', async () => {
  const user = s.tokenFor('user-q');
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await s.call('POST', '/api/v1/decks', { token: user, body: { name: `d${i}` } })).body.id);
  const over = await s.call('POST', '/api/v1/decks', { token: user, body: { name: 'one too many' } });
  assert.equal(over.status, 422);
  assert.equal(over.body.error.code, 'limit_reached');
  for (let i = 0; i < 3; i++) await s.call('POST', `/api/v1/decks/${ids[0]}/cards`, { token: user, body: { q: `q${i}`, a: 'a' } });
  assert.equal((await s.call('POST', `/api/v1/decks/${ids[0]}/cards`, { token: user, body: { q: 'extra', a: 'a' } })).status, 422);
});

test('deleting a deck cascades to cards; deleting the account removes everything', async () => {
  const user = s.tokenFor('user-del');
  const d = (await s.call('POST', '/api/v1/decks', { token: user, body: deckBody })).body;
  await s.call('POST', `/api/v1/decks/${d.id}/cards`, { token: user, body: { q: 'q', a: 'a' } });
  await s.call('POST', '/api/v1/sessions', { token: user, body: { day: '2026-10-8', reviewed: 1, correct: 1 } });
  assert.equal((await s.call('DELETE', '/api/v1/me', { token: user })).status, 204);
  for (const t of ['profiles', 'decks', 'cards', 'study_sessions']) {
    assert.equal(s.pg.tables[t].filter((r) => (r.user_id ?? r.id) === 'user-del').length, 0, t);
  }
  assert.equal(s.pg.tables.cards.filter((c) => c.deck_id === d.id).length, 0);
});

test('unknown routes 404, wrong methods 405, bad ids 404', async () => {
  assert.equal((await s.call('GET', '/nope', { token: A })).status, 404);
  assert.equal((await s.call('PUT', '/api/v1/decks', { token: A })).status, 405);
  assert.equal((await s.call('DELETE', '/api/v1/decks/not-a-uuid', { token: A })).status, 404);
});

test('the service key is sent to the database and never to clients', async () => {
  assert.ok(s.pg.log.length > 0);
  const r = await s.call('GET', '/api/v1/bootstrap', { token: A });
  assert.ok(!JSON.stringify(r.body).includes('service-key'));
});
