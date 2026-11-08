// Data-access layer. Every query is scoped by user_id, so a user can only ever
// touch their own rows even if an id from someone else is guessed.

import { HttpError, notFound } from '../lib/http.js';
import { nextSchedule } from '../services/scheduler.js';

const PROFILE_TTL_MS = 10 * 60 * 1000;

export const toCard = (row) => ({
  id: row.id,
  q: row.question,
  a: row.answer,
  interval: row.interval_days,
  due: row.due_at ? Date.parse(row.due_at) : 0,
  seen: row.seen_count,
  right: row.correct_count,
  createdAt: Date.parse(row.created_at),
});

export const toDeck = (row, cards = []) => ({
  id: row.id,
  name: row.name,
  subject: row.subject,
  icon: row.icon,
  createdAt: Date.parse(row.created_at),
  cards,
});

const toSession = (row) => ({ day: row.day, reviewed: row.reviewed, correct: row.correct });

export function createRepository(db, { maxDecks, maxCards, now = Date.now } = {}) {
  const knownProfiles = new Map(); // uid -> expiry (skip repeated upserts)
  const stamp = () => new Date(now()).toISOString();

  async function ensureProfile(user, { force = false } = {}) {
    if (!force && (knownProfiles.get(user.uid) ?? 0) > now()) return;
    await db.upsert('profiles', {
      id: user.uid,
      email: user.email,
      display_name: user.name,
      avatar_url: user.picture,
      last_seen_at: stamp(),
    });
    knownProfiles.set(user.uid, now() + PROFILE_TTL_MS);
  }

  return {
    ensureProfile,

    async bootstrap(user) {
      await ensureProfile(user, { force: true });
      const own = { user_id: user.uid };
      const [decks, cards, sessions] = await Promise.all([
        db.select('decks', { filters: own, order: 'created_at.asc' }),
        db.select('cards', { filters: own, order: 'created_at.asc' }),
        db.select('study_sessions', { filters: own, order: 'created_at.desc', limit: 500 }),
      ]);
      const byDeck = new Map();
      for (const row of cards) {
        if (!byDeck.has(row.deck_id)) byDeck.set(row.deck_id, []);
        byDeck.get(row.deck_id).push(toCard(row));
      }
      return {
        user: { id: user.uid, email: user.email, name: user.name, picture: user.picture },
        decks: decks.map((d) => toDeck(d, byDeck.get(d.id) ?? [])),
        sessions: sessions.reverse().map(toSession),
      };
    },

    async deleteAccount(user) {
      await db.remove('profiles', { id: user.uid }); // cascades to decks, cards, sessions
      knownProfiles.delete(user.uid);
    },

    async createDeck(user, input) {
      if ((await db.count('decks', { user_id: user.uid })) >= maxDecks) {
        throw new HttpError(422, 'limit_reached', `You can have up to ${maxDecks} decks`);
      }
      const row = await db.insert('decks', { ...input, id: input.id ?? crypto.randomUUID(), user_id: user.uid });
      return toDeck(row);
    },

    async updateDeck(user, id, patch) {
      const [row] = await db.update('decks', { id, user_id: user.uid }, { ...patch, updated_at: stamp() });
      if (!row) throw notFound('Deck not found');
      return toDeck(row);
    },

    async deleteDeck(user, id) {
      const rows = await db.remove('decks', { id, user_id: user.uid }); // cards cascade
      if (!rows.length) throw notFound('Deck not found');
    },

    async createCard(user, deckId, input) {
      const deck = await db.selectOne('decks', { id: deckId, user_id: user.uid });
      if (!deck) throw notFound('Deck not found');
      if ((await db.count('cards', { deck_id: deckId })) >= maxCards) {
        throw new HttpError(422, 'limit_reached', `A deck can hold up to ${maxCards} cards`);
      }
      const row = await db.insert('cards', {
        ...input,
        id: input.id ?? crypto.randomUUID(),
        deck_id: deckId,
        user_id: user.uid,
      });
      return toCard(row);
    },

    async updateCard(user, id, patch) {
      const [row] = await db.update('cards', { id, user_id: user.uid }, { ...patch, updated_at: stamp() });
      if (!row) throw notFound('Card not found');
      return toCard(row);
    },

    async deleteCard(user, id) {
      const rows = await db.remove('cards', { id, user_id: user.uid });
      if (!rows.length) throw notFound('Card not found');
    },

    /** Applies the scheduling rule; retries if the card changed under us (double tap, two tabs). */
    async reviewCard(user, id, correct) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const card = await db.selectOne('cards', { id, user_id: user.uid });
        if (!card) throw notFound('Card not found');
        const patch = { ...nextSchedule(card, correct, now()), updated_at: stamp() };
        const [row] = await db.update('cards', { id, user_id: user.uid, seen_count: card.seen_count }, patch);
        if (row) return toCard(row);
      }
      throw new HttpError(409, 'conflict', 'Card was changed by another request; please retry');
    },

    async createSession(user, input) {
      await ensureProfile(user);
      return toSession(await db.insert('study_sessions', { ...input, user_id: user.uid }));
    },
  };
}
