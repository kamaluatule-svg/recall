// Route table for /api/v1. Handlers receive { user, params, body } and return { status, body }.

import { Router } from '../lib/router.js';
import { notFound } from '../lib/http.js';
import { isUuid, parseCard, parseDeck, parseReview, parseSession } from '../lib/validation.js';

const V1 = '/api/v1';
const uuidParam = (params, key, what) => {
  if (!isUuid(params[key])) throw notFound(`${what} not found`);
  return params[key].toLowerCase();
};

export function buildRouter(repo) {
  const r = new Router();

  r.add('GET', '/health', async () => ({ status: 200, body: { status: 'ok', time: new Date().toISOString() } }), { auth: false });

  r.add('GET', `${V1}/bootstrap`, async ({ user }) => ({ status: 200, body: await repo.bootstrap(user) }));
  r.add('DELETE', `${V1}/me`, async ({ user }) => (await repo.deleteAccount(user), { status: 204 }));

  r.add('POST', `${V1}/decks`, async ({ user, body }) => ({
    status: 201,
    body: await repo.createDeck(user, parseDeck(body)),
  }));
  r.add('PATCH', `${V1}/decks/:id`, async ({ user, params, body }) => ({
    status: 200,
    body: await repo.updateDeck(user, uuidParam(params, 'id', 'Deck'), parseDeck(body, { partial: true })),
  }));
  r.add('DELETE', `${V1}/decks/:id`, async ({ user, params }) => (
    await repo.deleteDeck(user, uuidParam(params, 'id', 'Deck')), { status: 204 }
  ));

  r.add('POST', `${V1}/decks/:deckId/cards`, async ({ user, params, body }) => ({
    status: 201,
    body: await repo.createCard(user, uuidParam(params, 'deckId', 'Deck'), parseCard(body)),
  }));
  r.add('PATCH', `${V1}/cards/:id`, async ({ user, params, body }) => ({
    status: 200,
    body: await repo.updateCard(user, uuidParam(params, 'id', 'Card'), parseCard(body, { partial: true })),
  }));
  r.add('DELETE', `${V1}/cards/:id`, async ({ user, params }) => (
    await repo.deleteCard(user, uuidParam(params, 'id', 'Card')), { status: 204 }
  ));
  r.add('POST', `${V1}/cards/:id/review`, async ({ user, params, body }) => ({
    status: 200,
    body: await repo.reviewCard(user, uuidParam(params, 'id', 'Card'), parseReview(body).correct),
  }));

  r.add('POST', `${V1}/sessions`, async ({ user, body }) => ({
    status: 201,
    body: await repo.createSession(user, parseSession(body)),
  }));

  return r;
}
