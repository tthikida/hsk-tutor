// Freehand handwriting marker. Compares strokes drawn with no help against the reference stroke
// centre-lines (Make Me a Hanzi "medians") and returns a 0–100 score with per-stroke feedback.
//
// Coordinates: everything here is in the 1024×1024 character box with y pointing DOWN
// (reference medians are y-up with the baseline at 900, so they are flipped on the way in).

const N = 24;                          // points each stroke is resampled to
const PERFECT = 15, ZERO = 130;        // mean distance (box units) that scores 100% / 0% for a stroke
// points off for each mistake, on top of the shape score (a missing/extra stroke makes it a different character)
const PENALTY = { order: 8, backwards: 6, extra: 15, missing: 10 };
const RECOGNISABLE = 0.25;             // a stroke this good counts as "that stroke" for order/direction checks

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const length = pts => pts.slice(1).reduce((s, p, i) => s + dist(p, pts[i]), 0);

/** Resample a polyline to n points spaced evenly along its length. */
export function resample(pts, n = N) {
  if (pts.length === 1) return Array(n).fill(pts[0]);
  const total = length(pts) || 1, step = total / (n - 1), out = [pts[0]];
  let acc = 0, prev = pts[0];
  for (let i = 1; i < pts.length && out.length < n; i++) {
    let cur = pts[i], d = dist(prev, cur);
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d;
      const p = [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])];
      out.push(p); prev = p; d = dist(prev, cur); acc = 0;
    }
    acc += d; prev = cur;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out;
}

const meanDist = (a, b) => a.reduce((s, p, i) => s + dist(p, b[i]), 0) / a.length;
const bbox = strokes => {
  const xs = strokes.flat().map(p => p[0]), ys = strokes.flat().map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

const strokeScore = d => Math.max(0, Math.min(1, 1 - (d - PERFECT) / (ZERO - PERFECT)));
const clampK = k => Math.min(1.6, Math.max(0.6, k));
const apply = (pts, t) => pts.map(([x, y]) => [t.rx + (x - t.ux) * t.k, t.ry + (y - t.uy) * t.k]);

/** Pair each reference stroke with at most one drawn stroke, closest pairs first. */
function match(R, U) {
  const pairs = [];
  R.forEach((r, i) => U.forEach((u, j) => {
    const fwd = meanDist(r, u), rev = meanDist(r, [...u].reverse());
    pairs.push({ i, j, d: Math.min(fwd, rev), backwards: rev + 15 < fwd });
  }));
  pairs.sort((a, b) => a.d - b.d);
  const refTaken = new Map(), userTaken = new Set();
  for (const p of pairs) if (!refTaken.has(p.i) && !userTaken.has(p.j) && p.d < ZERO * 1.5) { refTaken.set(p.i, p); userTaken.add(p.j); }
  // badness: matched distances, unmatched strokes count as worst case
  const total = [...refTaken.values()].reduce((s, p) => s + Math.min(p.d, ZERO), 0) + ZERO * (R.length - refTaken.size) + ZERO * (U.length - userTaken.size);
  return { refTaken, userTaken, total };
}

/** Least-squares uniform scale + shift mapping the drawn points of good matches onto the reference. */
function fitFrom(refTaken, R, U0) {
  const P = [], Q = [];
  for (const p of refTaken.values()) {
    if (strokeScore(p.d) < RECOGNISABLE) continue;
    const u = p.backwards ? [...U0[p.j]].reverse() : U0[p.j];
    u.forEach((pt, n) => { P.push(pt); Q.push(R[p.i][n]); });
  }
  if (P.length < N * 2) return null;   // need at least two strokes to judge size and position
  const mean = A => [A.reduce((s, p) => s + p[0], 0) / A.length, A.reduce((s, p) => s + p[1], 0) / A.length];
  const [ux, uy] = mean(P), [rx, ry] = mean(Q);
  let num = 0, den = 0;
  P.forEach((p, n) => { const a = [p[0] - ux, p[1] - uy], b = [Q[n][0] - rx, Q[n][1] - ry]; num += a[0] * b[0] + a[1] * b[1]; den += a[0] ** 2 + a[1] ** 2; });
  return { k: clampK(den ? num / den : 1), ux, uy, rx, ry };
}

/** Reference medians (y-up) → y-down box coordinates. */
export const refStrokes = medians => medians.map(m => m.map(([x, y]) => [x, 900 - y]));

/** Positions in `a` forming one longest strictly increasing subsequence. */
function lis(a) {
  const tails = [], tailAt = [], prev = [];
  a.forEach((x, t) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const m = (lo + hi) >> 1; tails[m] < x ? lo = m + 1 : hi = m; }
    tails[lo] = x; tailAt[lo] = t; prev[t] = lo ? tailAt[lo - 1] : -1;
  });
  const out = [];
  for (let t = tails.length ? tailAt[tails.length - 1] : -1; t >= 0; t = prev[t]) out.push(t);
  return out.reverse();
}

/**
 * @param user   array of strokes, each an array of [x, y] in box coordinates (y down)
 * @param medians reference medians straight from the stroke data (y up)
 * @returns { score, shape, order, dir, expected, drawn, strokes:[{ref, user, score, backwards, outOfOrder, missing}], extra:[userIdx], userScore:[per user stroke 0..1 or null] }
 */
export function gradeStrokes(user, medians) {
  const ref = refStrokes(medians);
  const n = ref.length;
  const drawn = user.filter(s => s.length > 0);
  const empty = { score: 0, shape: 0, order: 0, dir: 0, expected: n, drawn: drawn.length, extra: [], userScore: [],
    strokes: ref.map((_, i) => ({ ref: i, user: null, score: 0, missing: true })) };
  if (!drawn.length) return empty;

  // Forgive where on the grid and how big it was written (within reason), but not the proportions
  // or placement of strokes relative to each other. Try a couple of starting fits, then refine the
  // fit from the strokes that actually matched (so a missing or stray stroke can't skew it).
  const R = ref.map(s => resample(s)), U0 = drawn.map(s => resample(s));
  const rb = bbox(ref), ub = bbox(drawn);
  const seeds = [{ k: 1, ux: 0, uy: 0, rx: 0, ry: 0 }, {
    k: clampK(Math.max(rb.x1 - rb.x0, rb.y1 - rb.y0, 60) / Math.max(ub.x1 - ub.x0, ub.y1 - ub.y0, 1)),
    ux: (ub.x0 + ub.x1) / 2, uy: (ub.y0 + ub.y1) / 2, rx: (rb.x0 + rb.x1) / 2, ry: (rb.y0 + rb.y1) / 2,
  }];
  let best = null;
  for (const seed of seeds) {
    let m = match(R, U0.map(s => apply(s, seed)));
    const refined = fitFrom(m.refTaken, R, U0);
    if (refined) m = match(R, U0.map(s => apply(s, refined)));
    if (!best || m.total < best.total) best = m;
  }
  const { refTaken, userTaken } = best;
  const matched = [...refTaken.values()].filter(p => strokeScore(p.d) >= RECOGNISABLE).sort((a, b) => a.i - b.i);
  // strokes on the longest run drawn in the right relative order count as correctly ordered
  const inOrder = new Set(lis(matched.map(p => p.j)).map(t => matched[t].i));

  const strokes = ref.map((_, i) => {
    const p = refTaken.get(i);
    if (!p) return { ref: i, user: null, score: 0, missing: true };
    const score = strokeScore(p.d), judged = score >= RECOGNISABLE;
    const longEnough = length(ref[i]) > 120;   // dots have no meaningful direction
    return { ref: i, user: p.j, score, backwards: judged && longEnough && p.backwards, outOfOrder: judged && !inOrder.has(i), missing: false };
  });
  const shape = strokes.reduce((s, x) => s + x.score, 0) / n;
  const outOfOrder = strokes.filter(s => s.outOfOrder).length, backwards = strokes.filter(s => s.backwards).length;
  const missing = strokes.filter(s => s.missing).length;
  const extra = drawn.map((_, j) => j).filter(j => !userTaken.has(j));
  const raw = 100 * shape - PENALTY.order * outOfOrder - PENALTY.backwards * backwards
    - PENALTY.extra * extra.length - PENALTY.missing * missing;
  const userScore = drawn.map((_, j) => { const s = strokes.find(x => x.user === j); return s ? s.score : null; });
  return { score: Math.max(0, Math.round(raw)), shape, outOfOrder, backwards, missing, expected: n, drawn: drawn.length, strokes, extra, userScore };
}

export function verdict(score) {
  return score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 55 ? "Getting there" : "Keep practising";
}
