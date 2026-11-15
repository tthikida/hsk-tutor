// Sync progress across devices through one private GitHub Gist.
// The token (gist permission only) is pasted by the user into Settings and kept on this device only.
// Every sync = download the cloud copy, merge it with this device's progress, upload the result.
import * as store from "./store.js?v=9";

const SKEY = "hsk-tutor-sync";            // {token, gistId, lastSync, lastError} — never exported or uploaded
const FILE = "hsk-tutor-progress.json";
const DESC = "HSK Tutor progress (private, synced by the app)";

let cfg = read();
let busy = null, timer = null;
const changeListeners = [];

function read() { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch { return {}; } }
function write() { try { localStorage.setItem(SKEY, JSON.stringify(cfg)); } catch {} changeListeners.forEach(fn => fn()); }

export const status = () => ({ connected: !!cfg.token, lastSync: cfg.lastSync || 0, error: cfg.lastError || "", busy: !!busy });
export const onStatus = fn => changeListeners.push(fn);

async function gh(path, opts = {}) {
  const r = await fetch("https://api.github.com" + path, {
    ...opts, cache: "no-store",
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (r.status === 401 || r.status === 403) throw new Error("GitHub didn't accept the token. Make sure it has the Gist permission and hasn't expired.");
  if (!r.ok) throw new Error(`GitHub error ${r.status}`);
  return r.status === 204 ? null : r.json();
}

/** Save the token, find this app's gist if one already exists (e.g. made on another device), then sync. */
export async function connect(token) {
  cfg = { token: token.trim() };
  try {
    const mine = await gh("/gists?per_page=100");
    const found = mine.find(g => g.files && g.files[FILE]);
    if (found) cfg.gistId = found.id;
  } catch (e) { cfg = {}; write(); throw e; }
  write();
  return syncNow();
}
export function disconnect() { cfg = {}; write(); }

async function download() {
  const g = await gh(`/gists/${cfg.gistId}`);
  const f = g.files && g.files[FILE];
  if (!f) return null;
  const text = f.truncated ? await (await fetch(f.raw_url, { cache: "no-store" })).text() : f.content;
  return JSON.parse(text);
}

/** Pull, merge, push. Safe to call often; overlapping calls share one run. */
export function syncNow() {
  if (!cfg.token) return Promise.resolve(false);
  if (busy) return busy;
  clearTimeout(timer);
  busy = (async () => {
    await null;   // let `busy` be set first so the status shows "Syncing…"
    write();
    try {
      const remote = cfg.gistId ? await download() : null;
      const merged = remote ? merge(store.S(), remote) : store.S();
      store.replace(merged);
      const content = JSON.stringify(forCloud(merged));
      if (cfg.gistId) await gh(`/gists/${cfg.gistId}`, { method: "PATCH", body: JSON.stringify({ files: { [FILE]: { content } } }) });
      else cfg.gistId = (await gh("/gists", { method: "POST", body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content } } }) })).id;
      cfg.lastSync = Date.now(); cfg.lastError = "";
      return true;
    } catch (e) {
      cfg.lastError = e.message || String(e);
      throw e;
    } finally { busy = null; write(); }
  })();
  return busy;
}

/** Push a few seconds after the last change, so a study session uploads in batches. */
export function schedule(ms = 4000) {
  if (!cfg.token) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow().catch(() => {}), ms);
}
export const pending = () => !!timer;

// device-only preferences stay on each device
function forCloud(s) { const { settings, ...rest } = s; return rest; }

const dateVal = d => { const [y, m, dd] = String(d || "0-0-0").split("-").map(Number); return new Date(y, m - 1, dd).getTime() || 0; };
const newerCard = (a, b) => (a.last || 0) !== (b.last || 0) ? (a.last || 0) > (b.last || 0) : (a.reps || 0) > (b.reps || 0);

/** Merge two progress states. Nothing studied on either device is lost:
 *  each card keeps whichever copy was reviewed most recently; introductions, study days and the
 *  review log are unioned; notes keep the most recently edited text. Settings stay local. */
export function merge(local, remote) {
  const out = { ...remote, ...local };
  out.settings = local.settings;

  out.cards = { ...(remote.cards || {}) };
  for (const [id, c] of Object.entries(local.cards || {})) if (!out.cards[id] || newerCard(c, out.cards[id])) out.cards[id] = c;

  out.introduced = { ...(remote.introduced || {}) };
  for (const [k, t] of Object.entries(local.introduced || {})) out.introduced[k] = out.introduced[k] ? Math.min(+out.introduced[k] || +t, +t || +out.introduced[k]) : t;

  out.pintro = { ...(remote.pintro || {}) };
  for (const [k, t] of Object.entries(local.pintro || {})) out.pintro[k] = out.pintro[k] ? Math.min(+out.pintro[k], +t) : t;
  const lp = local.pdaily || {}, rp = remote.pdaily || {};
  out.pdaily = lp.date === rp.date ? { date: lp.date, newCount: Math.max(lp.newCount || 0, rp.newCount || 0) }
    : dateVal(lp.date) >= dateVal(rp.date) ? lp : rp;

  out.notesAt = { ...(remote.notesAt || {}), ...(local.notesAt || {}) };
  out.notes = { ...(remote.notes || {}) };
  for (const [k, v] of Object.entries(local.notes || {})) {
    const lt = local.notesAt?.[k] || 0, rt = remote.notesAt?.[k] || 0;
    if (!(k in out.notes) || lt >= rt) { out.notes[k] = v; out.notesAt[k] = Math.max(lt, rt); }
  }

  if (local.days || remote.days) {
    out.days = { ...(remote.days || {}) };
    for (const [k, n] of Object.entries(local.days || {})) out.days[k] = Math.max(out.days[k] || 0, n);
  }

  const seen = new Set(), log = [];
  for (const e of [...(remote.log || []), ...(local.log || [])]) { const k = e[0] + "|" + e[1]; if (!seen.has(k)) { seen.add(k); log.push(e); } }
  log.sort((a, b) => a[0] - b[0]);
  out.log = log.slice(-5000);

  const ld = local.daily || {}, rd = remote.daily || {};
  out.daily = ld.date === rd.date ? { date: ld.date, newCount: Math.max(ld.newCount || 0, rd.newCount || 0) }
    : dateVal(ld.date) >= dateVal(rd.date) ? ld : rd;
  return out;
}
