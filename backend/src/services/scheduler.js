// Lightweight spaced repetition, identical to the rule the app always used:
//   correct -> interval doubles (1, 2, 4, 8 ... capped at 30 days)
//   missed  -> back to learning, due again in 10 minutes
// Pure function: the server is the source of truth for scheduling.

export const MAX_INTERVAL_DAYS = 30;
export const RELEARN_MS = 10 * 60 * 1000;
const DAY_MS = 86_400_000;

/**
 * @param {{interval_days:number, seen_count:number, correct_count:number}} card
 * @param {boolean} correct
 * @param {number} nowMs
 */
export function nextSchedule(card, correct, nowMs = Date.now()) {
  const seen_count = card.seen_count + 1;
  if (correct) {
    const interval_days = card.interval_days ? Math.min(MAX_INTERVAL_DAYS, card.interval_days * 2) : 1;
    return {
      interval_days,
      due_at: new Date(nowMs + interval_days * DAY_MS).toISOString(),
      seen_count,
      correct_count: card.correct_count + 1,
    };
  }
  return {
    interval_days: 0,
    due_at: new Date(nowMs + RELEARN_MS).toISOString(),
    seen_count,
    correct_count: card.correct_count,
  };
}
