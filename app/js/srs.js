// FSRS-4.5 spaced repetition (https://github.com/open-spaced-repetition). Ratings: 1 Again, 2 Hard, 3 Good, 4 Easy.
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461,
  2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5, FACTOR = 19 / 81, RETENTION = 0.9, MAX_DAYS = 3650;
const DAY = 86400000, MIN = 60000;

const clampD = d => Math.min(10, Math.max(1, d));
const initS = g => W[g - 1];
const initD = g => clampD(W[4] - (g - 3) * W[5]);
export const retrievability = (days, s) => Math.pow(1 + FACTOR * days / s, DECAY);
const intervalDays = s => Math.min(MAX_DAYS, Math.max(1, Math.round(s / FACTOR * (Math.pow(RETENTION, 1 / DECAY) - 1))));

function nextD(d, g) {
  const d2 = d - W[6] * (g - 3);
  return clampD(W[7] * initD(4) + (1 - W[7]) * d2);
}
function recallS(d, s, r, g) {
  const hard = g === 2 ? W[15] : 1, easy = g === 4 ? W[16] : 1;
  return s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy + 1);
}
function forgetS(d, s, r) {
  return Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
}

export function newCard(due = Date.now()) {
  return { state: "new", s: 0, d: 0, due, last: 0, reps: 0, lapses: 0 };
}

/** Returns the updated card (does not mutate). */
export function review(card, g, now = Date.now()) {
  const c = { ...card, reps: card.reps + 1 };
  if (card.state === "new") {
    c.s = initS(g); c.d = initD(g);
  } else {
    const days = Math.max(0, (now - card.last) / DAY);
    const r = retrievability(days, card.s);
    if (g === 1) { c.s = forgetS(card.d, card.s, r); c.lapses = card.lapses + 1; }
    else c.s = recallS(card.d, card.s, r, g);
    c.d = nextD(card.d, g);
  }
  c.last = now;
  if (g === 1) { c.state = "relearn"; c.due = now + MIN; }
  else { c.state = "review"; c.due = now + intervalDays(c.s) * DAY; }
  return c;
}

/** Human-readable next interval for each rating button. */
export function preview(card, now = Date.now()) {
  const out = {};
  let prev = 0;
  for (const g of [1, 2, 3, 4]) {
    const c = review(card, g, now);
    let ms = c.due - now;
    if (g > 1 && ms <= prev) ms = prev + DAY; // keep buttons strictly increasing
    prev = ms;
    out[g] = fmt(ms);
  }
  return out;
}
export function fmt(ms) {
  if (ms < 3600000) return Math.max(1, Math.round(ms / MIN)) + "m";
  if (ms < DAY) return Math.round(ms / 3600000) + "h";
  const d = ms / DAY;
  if (d < 31) return Math.round(d) + "d";
  if (d < 365) return Math.round(d / 30) + "mo";
  return (d / 365).toFixed(1) + "y";
}
