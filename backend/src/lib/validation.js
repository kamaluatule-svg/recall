// Input validation. Each parser returns a clean object or throws a 422 listing every bad field.

import { invalid } from './http.js';

export const DECK_ICONS = [
  'layers-2', 'book-open', 'dna', 'leaf', 'landmark', 'brain',
  'globe-2', 'microscope', 'pen-line', 'palette', 'laptop',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{1,2}-\d{1,2}$/;

export const isUuid = (v) => typeof v === 'string' && UUID.test(v);

function text(body, field, { min = 1, max, required = true, errors }) {
  const v = body[field];
  if (v === undefined) {
    if (required) errors[field] = 'is required';
    return undefined;
  }
  if (typeof v !== 'string') return void (errors[field] = 'must be a string');
  const t = v.trim();
  if (t.length < min) return void (errors[field] = `must be at least ${min} character${min > 1 ? 's' : ''}`);
  if (t.length > max) return void (errors[field] = `must be at most ${max} characters`);
  return t;
}

function finish(errors, out) {
  if (Object.keys(errors).length) throw invalid(errors);
  return out;
}

function optionalId(body, errors) {
  if (body.id === undefined) return undefined;
  if (!isUuid(body.id)) return void (errors.id = 'must be a UUID');
  return body.id.toLowerCase();
}

/** partial=true for PATCH: only provided fields are validated and returned. */
export function parseDeck(body, { partial = false } = {}) {
  const errors = {};
  const out = {};
  const name = text(body, 'name', { max: 48, required: !partial, errors });
  const subject = text(body, 'subject', { max: 32, required: false, errors });
  if (name !== undefined) out.name = name;
  if (subject !== undefined) out.subject = subject;
  if (!partial && out.subject === undefined) out.subject = 'General';
  if (body.icon !== undefined) {
    if (!DECK_ICONS.includes(body.icon)) errors.icon = `must be one of: ${DECK_ICONS.join(', ')}`;
    else out.icon = body.icon;
  }
  if (!partial) {
    const id = optionalId(body, errors);
    if (id) out.id = id;
  }
  if (partial && !Object.keys(errors).length && !Object.keys(out).length) errors.body = 'no updatable fields provided';
  return finish(errors, out);
}

export function parseCard(body, { partial = false } = {}) {
  const errors = {};
  const out = {};
  const q = text(body, 'q', { max: 500, required: !partial, errors });
  const a = text(body, 'a', { max: 1000, required: !partial, errors });
  if (q !== undefined) out.question = q;
  if (a !== undefined) out.answer = a;
  if (!partial) {
    const id = optionalId(body, errors);
    if (id) out.id = id;
  }
  if (partial && !Object.keys(errors).length && !Object.keys(out).length) errors.body = 'no updatable fields provided';
  return finish(errors, out);
}

export function parseReview(body) {
  const errors = {};
  if (typeof body.correct !== 'boolean') errors.correct = 'must be true or false';
  return finish(errors, { correct: body.correct });
}

export function parseSession(body) {
  const errors = {};
  if (typeof body.day !== 'string' || !DAY.test(body.day)) errors.day = 'must look like 2026-10-8';
  const intIn = (field, min, max) => {
    const v = body[field];
    if (!Number.isInteger(v) || v < min || v > max) errors[field] = `must be an integer from ${min} to ${max}`;
    return v;
  };
  const reviewed = intIn('reviewed', 1, 10000);
  const correct = intIn('correct', 0, 10000);
  if (!errors.reviewed && !errors.correct && correct > reviewed) errors.correct = 'cannot exceed reviewed';
  return finish(errors, { day: body.day, reviewed, correct });
}
