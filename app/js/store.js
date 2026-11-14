// Progress is kept in localStorage (small: a few hundred KB at most) with export/import as a JSON file.
const KEY = "hsk-tutor-v1";

const DEFAULTS = {
  newPerDay: 10,
  voice: "alt",          // "f", "m" or "alt" (alternate)
  autoplay: true,
  showTrad: true,
  writeMode: "strict",   // "strict" = stroke checking, "free" = draw then self-grade
  level: 1,
};

function blank() {
  return { v: 1, settings: { ...DEFAULTS }, cards: {}, introduced: {}, notes: {}, daily: { date: "", newCount: 0 }, log: [] };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      s.settings = { ...DEFAULTS, ...s.settings };
      return { ...blank(), ...s };
    }
  } catch (e) { console.warn("could not read progress", e); }
  return blank();
}

const listeners = [];
/** Called after every save (used to trigger cloud sync). */
export function onSave(fn) { listeners.push(fn); }

export function save(silent = false) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.warn("could not save progress", e); }
  if (!silent) listeners.forEach(fn => fn());
}

/** Swap in a whole state (e.g. merged with the cloud copy) without re-triggering sync. */
export function replace(s) {
  state = { ...blank(), ...s, settings: { ...DEFAULTS, ...s.settings } };
  save(true);
}

export const S = () => state;

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function newLeftToday() {
  if (state.daily.date !== today()) state.daily = { date: today(), newCount: 0 };
  return Math.max(0, state.settings.newPerDay - state.daily.newCount);
}

export function exportJSON() {
  return JSON.stringify(state, null, 1);
}

export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || typeof s !== "object" || !s.cards) throw new Error("This file doesn't look like a progress backup.");
  state = { ...blank(), ...s, settings: { ...DEFAULTS, ...s.settings } };
  save();
}

export function resetAll() {
  state = blank();
  save();
}
