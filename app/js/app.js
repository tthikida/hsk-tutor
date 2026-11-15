import { newCard, review, preview } from "./srs.js?v=17";
import * as store from "./store.js?v=17";
import * as sync from "./sync.js?v=17";
import { gradeStrokes, verdict } from "./grade.js?v=17";
import * as bao from "./bao.js?v=17";

const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };

let D = null;                 // level data
let audioIndex = {};          // which clips exist per voice
const words = {}, comps = new Set();
const ORDER_POS = {};         // item key -> position in learning order
const view = () => $("#view");

/* ---------------- data helpers ---------------- */
const ik = (type, id) => `${type}:${id}`;           // item key, e.g. w:你 or c:亻
const FACETS = { w: ["read", "write", "listen", "tones"], c: ["read", "write"] };
const FACET_LABEL = { read: "Read", write: "Write", listen: "Listen", tones: "Tones" };

function hex(s) { return Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, "0")).join(""); }
function tones(num) { return (num || "").split(/\s+/).filter(Boolean).map(x => +(x.match(/[1-5]$/)?.[0] || 5)); }
function sylls(py) { return py.split(/\s+/).filter(Boolean); }

function pinyinHTML(py, num) {
  const ts = tones(num), ss = sylls(py);
  if (ts.length !== ss.length) return `<span class="py">${esc(py)}</span>`;
  return `<span class="py">${ss.map((s, i) => `<span class="t${ts[i]}">${esc(s)}</span>`).join(" ")}</span>`;
}

function introduced(key) { return !!store.S().introduced[key]; }
function charKnown(c) {
  if (introduced(ik("w", c)) || introduced(ik("c", c))) return true;
  return (D.chars[c]?.usedIn?.words || []).some(w => introduced(ik("w", w)));
}
function itemForChar(c) {
  if (words[c]) return ik("w", c);
  if (comps.has(c)) return ik("c", c);
  const w = (D.chars[c]?.usedIn?.words || []).find(w => introduced(ik("w", w))) || D.chars[c]?.usedIn?.words?.[0];
  return w ? ik("w", w) : null;
}
function itemInfo(key) {
  const [type, id] = [key[0], key.slice(2)];
  if (type === "w") return { type, id, w: words[id], text: id };
  const c = D.chars[id] || {};
  return { type, id, text: id, def: c.def, py: c.py?.[0] || "" };
}
function meaningOf(key) {
  const it = itemInfo(key);
  return it.type === "w" ? it.w.en.slice(0, 2).join("; ") : (it.def || "component");
}

/* ---------------- audio (neural clips only, never device TTS) ---------------- */
let altFlip = false, currentAudio = null;
function voiceFor() {
  const v = store.S().settings.voice;
  if (v !== "alt") return v;
  altFlip = !altFlip;
  return altFlip ? "f" : "m";
}
function play(kind, text, voice, quiet = false) {
  const k = `${kind}_${hex(text)}`;
  const have = audioIndex[k] || [];
  let v = voice || voiceFor();
  if (!have.includes(v)) v = have[0];
  if (!v) { if (!quiet) toast("Audio for this one hasn't been generated yet"); return; }
  if (currentAudio) currentAudio.pause();
  currentAudio = new Audio(`audio/${v}/${k}.mp3`);
  currentAudio.play().catch(() => {});
}
const hasAudio = (kind, text) => (audioIndex[`${kind}_${hex(text)}`] || []).length > 0;

function audioButtons(kind, text) {
  if (!hasAudio(kind, text)) return kind === "c" ? "" : `<span class="muted small">audio pending</span>`;
  return `<span class="audio-btns">
    <button class="icon-btn" data-play="${kind}|${esc(text)}|f" aria-label="Female voice">🔊<small>女</small></button>
    <button class="icon-btn" data-play="${kind}|${esc(text)}|m" aria-label="Male voice">🔊<small>男</small></button></span>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-play]");
  if (b) { const [k, t, v] = b.dataset.play.split("|"); play(k, t, v); }
  const c = e.target.closest("[data-char]");
  if (c) { e.preventDefault(); openSheet({ type: "char", c: c.dataset.char }); }
  const it = e.target.closest("[data-item]");
  if (it) { e.preventDefault(); openSheet({ type: "item", key: it.dataset.item }); }
  const ws = e.target.closest("[data-write-sentence]");
  if (ws) { e.preventDefault(); openSheet({ type: "sentence", wid: ws.dataset.writeSentence }); }
});

function toast(msg) {
  const t = h(`<div class="toast">${esc(msg)}</div>`);
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

/* ---------------- rendering pieces ---------------- */
function hanziHTML(text, { big = true, tappable = true } = {}) {
  const chars = [...text].map(c => tappable && D.chars[c]
    ? `<a href="#" class="hz-c" data-char="${esc(c)}">${esc(c)}</a>` : `<span>${esc(c)}</span>`).join("");
  return `<div class="hz ${big ? "big" : ""}">${chars}</div>`;
}
function tradHTML(w) {
  if (!store.S().settings.showTrad || !w || w.t === w.s) return "";
  return `<div class="trad">繁 ${esc(w.t)}</div>`;
}
function sentenceHTML(wid) {
  const s = D.sentences?.[wid];
  if (!s) return "";
  const toks = s.toks.map(t => t.p ? esc(t.w)
    : `<ruby>${t.id ? `<a href="#" data-item="${esc(ik("w", t.id))}" class="${t.id === wid ? "hl" : ""}">${esc(t.w)}</a>` : esc(t.w)}<rt>${esc(t.py || "")}</rt></ruby>`).join("");
  return `<div class="sentence"><div class="zh">${toks}</div>
    <div class="en">${esc(s.en)}</div><div class="sentence-actions">${audioButtons("s", wid)}
    <button class="btn ghost small" data-write-sentence="${esc(wid)}">✍️ Write it</button></div></div>`;
}
function partsHTML(text) {
  const out = [];
  for (const c of new Set(text)) {
    const parts = D.chars[c]?.parts || [];
    if (!parts.length) continue;
    out.push(`<div class="parts-row"><a href="#" class="chip big" data-char="${esc(c)}">${esc(c)}</a> =
      ${parts.map(p => `<a href="#" class="chip ${charKnown(p) ? "known" : "unknown"}" data-char="${esc(p)}">${esc(p)}
      <small>${esc(shortDef(p))}</small></a>`).join("+")}</div>`);
  }
  return out.length ? `<div class="parts"><div class="label">Built from</div>${out.join("")}</div>` : "";
}
function shortDef(c) {
  if (words[c]) return words[c].en[0].split(/[;,(]/)[0];
  return (D.chars[c]?.def || "").split(/[;,]/)[0];
}
function notesHTML(key) {
  return `<label class="notes"><span class="label">My memory story</span>
    <textarea data-notes="${esc(key)}" rows="2" placeholder="Write a mnemonic…">${esc(store.S().notes[key] || "")}</textarea></label>`;
}
document.addEventListener("input", e => {
  const t = e.target.closest("[data-notes]");
  if (t) { const S = store.S(); S.notes[t.dataset.notes] = t.value; (S.notesAt ||= {})[t.dataset.notes] = Date.now(); store.save(); }
});

function answerHTML(key, { showHanzi = true } = {}) {
  const it = itemInfo(key);
  if (it.type === "w") {
    const w = it.w;
    return `<div class="answer">
      ${showHanzi ? hanziHTML(w.s) + tradHTML(w) : ""}
      <div class="py-line">${pinyinHTML(w.py, w.num)} ${audioButtons("w", w.s)}</div>
      <div class="meaning">${w.en.map(esc).join("<br>")}</div>
      ${sentenceHTML(w.id)}
      ${partsHTML(w.s)}
      ${notesHTML(key)}
    </div>`;
  }
  const c = D.chars[it.id] || {};
  return `<div class="answer">
    ${showHanzi ? hanziHTML(it.id) : ""}
    <div class="badge">component</div>
    <div class="meaning">${esc(c.def || "")}</div>
    ${c.py?.length ? `<div class="py-line"><span class="py">${esc(c.py.join(", "))}</span> ${audioButtons("c", it.id)}</div>` : ""}
    ${c.hint ? `<div class="hint">${esc(c.hint)}</div>` : ""}
    ${partsHTML(it.id)}
    ${usedInHTML(it.id)}
    ${notesHTML(key)}
  </div>`;
}
function usedInHTML(c) {
  const u = D.chars[c]?.usedIn || { words: [], chars: [] };
  const ws = [...u.words].sort((a, b) => introduced(ik("w", b)) - introduced(ik("w", a)));
  const cs = [...u.chars].sort((a, b) => charKnown(b) - charKnown(a));
  if (!ws.length && !cs.length) return "";
  return `<div class="parts"><div class="label">Used in</div><div class="chips">
    ${cs.map(x => `<a href="#" class="chip ${charKnown(x) ? "known" : "unknown"}" data-char="${esc(x)}">${esc(x)}</a>`).join("")}
    ${ws.slice(0, 24).map(x => `<a href="#" class="chip ${introduced(ik("w", x)) ? "known" : "unknown"}" data-item="${esc(ik("w", x))}">${esc(x)}</a>`).join("")}
  </div></div>`;
}

/* ---------------- writing (hanzi-writer) ---------------- */
const loader = (char, onLoad, onErr) => fetch(`data/strokes/${char}.json`).then(r => r.json()).then(onLoad).catch(onErr);
const hasStrokes = c => (D.chars[c]?.strokes || 0) > 0;
function writerSize() { return Math.min(300, window.innerWidth - 64); }

/** Scroll `node` so it sits in the middle of its scroll area, unless it is already fully visible. */
function ensureVisible(node, smooth = true) {
  if (!node) return;
  const sc = node.closest(".sheet-body");
  const top = sc ? sc.getBoundingClientRect().top : 0;
  const bottom = sc ? sc.getBoundingClientRect().bottom : window.innerHeight;
  const r = node.getBoundingClientRect();
  if (r.top < top || r.bottom > bottom) node.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
}

/** Quiz the user on each character in turn. Resolves with total mistakes and hints used.
 *  outline: true/false, or a function (char, index) -> bool for per-character outlines.
 *  onChar(i): called before each character (and with chars.length at the end); progress: false hides the built-in progress row.
 *  focus: the element to keep on screen (defaults to the writing box).
 *  alive(): return false to abandon this run (e.g. the drill switched modes); it then never resolves or redraws. */
function quizWord(el, text, { outline = false, onChar = null, progress = true, focus = null, alive = () => true } = {}) {
  const chars = [...text].filter(hasStrokes);
  let i = 0, mistakes = 0;
  return new Promise(resolve => {
    const next = () => {
      if (!alive()) return;
      onChar?.(i);
      if (i >= chars.length) {
        el.querySelectorAll(".writer-progress span").forEach((s, j) => { s.className = "done"; s.textContent = chars[j]; });
        el.querySelector(".row")?.remove();
        return resolve({ mistakes });
      }
      el.innerHTML = `${progress ? `<div class="writer-progress">${chars.map((c, j) => `<span class="${j < i ? "done" : j === i ? "cur" : ""}">${j < i ? esc(c) : "?"}</span>`).join("")}</div>` : ""}
        <div class="grid-box" style="width:${writerSize()}px;height:${writerSize()}px"><div class="hw"></div></div>
        <div class="row"><button class="btn ghost small" data-hint>Hint</button><button class="btn ghost small" data-giveup>Show me</button></div>`;
      ensureVisible(focus || $(".grid-box", el), i === 0);
      const w = HanziWriter.create($(".hw", el), chars[i], {
        width: writerSize(), height: writerSize(), padding: 10, charDataLoader: loader,
        showCharacter: false, showOutline: typeof outline === "function" ? outline(chars[i], i) : outline, showHintAfterMisses: 3, highlightOnComplete: true,
        strokeColor: getComputedStyle(document.body).getPropertyValue("--ink").trim() || "#222",
        outlineColor: "rgba(128,128,128,.25)", drawingColor: getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#c33",
        drawingWidth: 18,
      });
      w.quiz({
        onMistake: () => { mistakes++; },
        onComplete: () => advance(450),
      });
      // advance exactly once per character, however many times the buttons are tapped
      let moved = false;
      const advance = ms => { if (moved) return; moved = true; i++; setTimeout(next, ms); };
      const hint = $("[data-hint]", el), giveup = $("[data-giveup]", el);
      hint.onclick = () => { mistakes += 2; w.showOutline(); hint.disabled = true; };
      giveup.onclick = () => {
        if (giveup.disabled) return;
        giveup.disabled = hint.disabled = true;
        mistakes += 5; w.cancelQuiz(); w.showCharacter(); w.animateCharacter({ onComplete: () => advance(600) });
      };
    };
    next();
  });
}

/* ---------------- writing drill: same character over and over ---------------- */
const DRILL_MODES = { trace: "Trace", memory: "Memory", auto: "Auto" };
const DRILL_HELP = {
  trace: "Trace over the outline as many times as you like.",
  memory: "No outline — write it from memory. Hint shows the outline if you're stuck.",
  auto: "Starts with tracing; turns it off after 3 clean reps in a row, back on if you struggle.",
};
function drillPrompt(text) {
  const w = words[text];
  if (w) return `${pinyinHTML(w.py, w.num)} <span class="muted">· ${esc(w.en.slice(0, 2).map(s => s.replace(/\s*\(.*?\)/g, "")).join("; "))}</span>`;
  const c = D.chars[text] || {};
  return `<span class="py">${esc((c.py || []).join(", "))}</span> <span class="muted">· ${esc(shortDef(text) || "")}</span>`;
}
/** Repeat-writing drill. Remembers the chosen mode between drills. */
function startDrill(host, text) {
  const S = store.S();
  const chars = [...text].filter(hasStrokes);
  let target = chars.length > 1 ? text : chars[0];
  let mode = S.settings.drillMode || "trace";
  let outline = mode !== "memory", clean = 0, run = 0;
  let results = [];

  host.innerHTML = `<div class="drill">
    <div class="seg" data-dmodes>${Object.entries(DRILL_MODES).map(([m, l]) => `<button data-dm="${m}" class="${m === mode ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="muted small center" data-dhelp></div>
    ${chars.length > 1 ? `<div class="chips center drill-targets">
      <button class="chip on" data-dt="${esc(text)}">${esc(text)}</button>
      ${chars.map(c => `<button class="chip" data-dt="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
    <div class="drill-prompt" data-dprompt></div>
    <div class="drill-status"><span data-dcount></span><span class="drill-dots" data-ddots></span></div>
    <div class="drill-writer" data-dwriter></div>
  </div>`;
  const $d = s => host.querySelector(s);

  const drawStatus = () => {
    const n = results.length, cleanN = results.filter(m => m === 0).length;
    $d("[data-dcount]").innerHTML = n ? `<b>${n}</b> rep${n === 1 ? "" : "s"} · ${cleanN} clean` : "Rep 1";
    $d("[data-ddots]").innerHTML = results.slice(-24).map(m => `<i class="${m === 0 ? "good" : m <= 2 ? "ok" : "bad"}" title="${m} mistakes"></i>`).join("");
    $d("[data-dhelp]").textContent = mode === "auto" ? `${DRILL_HELP.auto} Tracing is ${outline ? "on" : "off"} now.` : DRILL_HELP[mode];
    // in memory (no outline) hide the character itself: prompt with pinyin + meaning only
    $d("[data-dprompt]").innerHTML = `${outline ? `<span class="hz-inline drill-char">${esc(target)}</span> ` : ""}${drillPrompt(target)}
      ${audioButtons(words[target] ? "w" : "c", target)}`;
  };
  const rep = () => {
    const my = ++run;
    drawStatus();
    const multi = [...target].filter(hasStrokes).length > 1;
    quizWord($d("[data-dwriter]"), target, { outline, progress: multi, alive: () => my === run && host.isConnected }).then(({ mistakes }) => {
      results.push(mistakes);
      let msg = mistakes === 0 ? "✓ Clean!" : `${mistakes} mistake${mistakes === 1 ? "" : "s"}`;
      if (mode === "auto") {
        if (outline) { clean = mistakes === 0 ? clean + 1 : 0; if (clean >= 3) { outline = false; clean = 0; msg = "3 clean in a row — tracing off now!"; } }
        else if (mistakes >= 4) { outline = true; clean = 0; msg = "Tracing back on for a few reps"; }
      }
      toast(msg);
      drawStatus();
      setTimeout(() => { if (my === run && host.isConnected) rep(); }, 700);
    });
  };
  host.querySelectorAll("[data-dm]").forEach(b => b.onclick = () => {
    mode = b.dataset.dm; S.settings.drillMode = mode; store.save();
    outline = mode !== "memory"; clean = 0;
    host.querySelectorAll("[data-dm]").forEach(x => x.classList.toggle("on", x === b));
    rep();
  });
  host.querySelectorAll("[data-dt]").forEach(b => b.onclick = () => {
    target = b.dataset.dt; results = []; clean = 0; outline = mode !== "memory";
    host.querySelectorAll("[data-dt]").forEach(x => x.classList.toggle("on", x === b));
    rep();
  });
  rep();
}

function animateWord(el, text) {
  el.innerHTML = "";
  const chars = [...text].filter(hasStrokes);
  const size = Math.min(140, (window.innerWidth - 64) / Math.max(1, chars.length) - 8);
  chars.forEach(c => {
    const box = h(`<div class="grid-box small" style="width:${size}px;height:${size}px"></div>`);
    el.append(box);
    const w = HanziWriter.create(box, c, { width: size, height: size, padding: 5, charDataLoader: loader,
      strokeColor: getComputedStyle(document.body).getPropertyValue("--ink").trim() || "#222",
      outlineColor: "rgba(128,128,128,.25)",   // the default #DDD looks like a finished character on the dark theme
      delayBetweenStrokes: 250 });
    box.onclick = () => w.animateCharacter();
    setTimeout(() => w.animateCharacter(), 300);
  });
  if (chars.length) el.append(h(`<div class="muted small center full">tap a character to replay strokes</div>`));
}

function freePad(el) {
  const size = writerSize();
  el.innerHTML = `<div class="grid-box" style="width:${size}px;height:${size}px"><canvas width="${size * 2}" height="${size * 2}" style="width:${size}px;height:${size}px"></canvas></div>
    <div class="row"><button class="btn ghost small" data-clear>Clear</button></div>`;
  const cv = $("canvas", el), ctx = cv.getContext("2d");
  ctx.lineCap = ctx.lineJoin = "round"; ctx.lineWidth = 14;
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--ink").trim();
  let drawing = false;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 2, (e.clientY - r.top) * 2]; };
  cv.onpointerdown = e => { drawing = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); };
  cv.onpointermove = e => { if (drawing) { ctx.lineTo(...pos(e)); ctx.stroke(); } };
  cv.onpointerup = cv.onpointercancel = () => { drawing = false; };
  $("[data-clear]", el).onclick = () => ctx.clearRect(0, 0, cv.width, cv.height);
}

/* ---------------- handwriting test: freehand, no help, marked out of 100 ---------------- */
const strokeData = {};
const loadStrokes = c => strokeData[c] ??= fetch(`data/strokes/${c}.json`).then(r => r.json());

/** Characters to test when none is typed in: ones you've met, else the first level-1 characters. */
function testPool() {
  const met = Object.keys(charTiers()).filter(hasStrokes);
  return met.length >= 3 ? met : level1Chars().filter(hasStrokes).slice(0, 30);
}
function testRecord(c) { return (store.S().tests || {})[c]; }
function saveTest(c, score, peeked) {
  const S = store.S(); S.tests ||= {};
  const r = S.tests[c] || { best: 0, n: 0 };
  S.tests[c] = { best: peeked ? r.best : Math.max(r.best, score), last: score, n: r.n + 1, at: Date.now() };
  markActive(); store.save(); updateBadge();
}
const scoreColor = s => s >= 0.75 ? "var(--ok)" : s >= 0.45 ? "var(--warn)" : "var(--accent)";

/**
 * Freehand test of one word or character. Nothing is snapped or drawn for you: you write it, then
 * it's marked. `onNext` picks what to test after this one.
 */
function testPad(host, text, { onNext }) {
  const chars = [...text].filter(hasStrokes);
  let idx = 0;
  const results = [];
  const run = () => testChar(host, chars, idx, {
    onDone: r => { results.push(r); },
    onNextChar: () => { idx++; run(); },
    onFinish: () => onNext(),
    wordScores: results,
  });
  run();
}

function testChar(host, chars, idx, { onDone, onNextChar, onFinish, wordScores }) {
  const c = chars[idx], word = chars.join(""), multi = chars.length > 1;
  const size = writerSize(), W2 = size * 2, pad = Math.round(W2 * 0.06), s = (W2 - 2 * pad) / 1024;
  const rec = testRecord(c);
  host.innerHTML = `<div class="test">
    ${multi ? `<div class="writer-progress">${chars.map((x, j) => `<span class="${j < idx ? "done" : j === idx ? "cur" : ""}">${j < idx ? esc(x) : "?"}</span>`).join("")}</div>` : ""}
    <div class="drill-prompt">${drillPrompt(multi && idx === 0 ? word : c)} ${audioButtons(words[word] ? "w" : "c", multi ? word : c)}</div>
    <div class="muted small center" data-tinfo>${multi ? `Character ${idx + 1} of ${chars.length} · ` : ""}${rec ? `Best ${rec.best} · ${rec.n} ${rec.n === 1 ? "try" : "tries"}` : "Write it from memory — no help, no snapping."}</div>
    <div class="grid-box" style="width:${size}px;height:${size}px"><canvas width="${W2}" height="${W2}" style="width:${size}px;height:${size}px"></canvas></div>
    <div class="row" data-tdraw>
      <button class="btn ghost small" data-undo>↶ Undo</button><button class="btn ghost small" data-clear>Clear</button>
      <button class="btn ghost small" data-peek>👀 Peek</button><button class="btn primary small" data-grade>Grade</button>
    </div>
    <div data-tresult></div>
  </div>`;
  const $t = q => host.querySelector(q);
  const cv = $t("canvas"), ctx = cv.getContext("2d");
  const ink = getComputedStyle(document.body).getPropertyValue("--ink").trim() || "#222";
  const strokes = [];   // in canvas pixels
  let cur = null, peeked = false, graded = false, data = null;
  loadStrokes(c).then(d => data = d).catch(() => {});

  const toBox = ([x, y]) => [(x - pad) / s, (y - pad) / s];
  const line = (pts, color, width) => {
    if (!pts.length) return;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(...pts[0]); pts.slice(1).forEach(p => ctx.lineTo(...p));
    if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.1, pts[0][1]);
    ctx.stroke();
  };
  const drawModel = alpha => {
    if (!data) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = ink;
    ctx.translate(pad, pad); ctx.scale(s, s); ctx.translate(0, 900); ctx.scale(1, -1);
    data.strokes.forEach(p => ctx.fill(new Path2D(p)));
    ctx.restore();
  };
  const redraw = () => { ctx.clearRect(0, 0, W2, W2); strokes.forEach(st => line(st, ink, 14)); };

  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W2 / r.width, (e.clientY - r.top) * W2 / r.height]; };
  cv.onpointerdown = e => { if (graded) return; try { cv.setPointerCapture(e.pointerId); } catch {} cur = [pos(e)]; strokes.push(cur); redraw(); };
  cv.onpointermove = e => { if (!cur) return; cur.push(pos(e)); line(cur.slice(-2), ink, 14); };
  cv.onpointerup = cv.onpointercancel = () => { cur = null; };
  $t("[data-undo]").onclick = () => { strokes.pop(); redraw(); };
  $t("[data-clear]").onclick = () => { strokes.length = 0; redraw(); };
  $t("[data-peek]").onclick = () => {
    if (!data) return;
    peeked = true; $t("[data-tinfo]").textContent = "Peeked — this attempt won't count toward your best.";
    drawModel(0.35); setTimeout(() => { if (!graded) redraw(); }, 1200);
  };

  $t("[data-grade]").onclick = () => {
    if (!data) return toast("Still loading…");
    if (!strokes.length) return toast("Write the character first");
    graded = true;
    const r = gradeStrokes(strokes.map(st => st.map(toBox)), data.medians);
    saveTest(c, r.score, peeked);
    if (!peeked) baoReact(r.score >= 70, r.score >= 90 || r.score < 30);
    onDone(r.score);
    // show: faint model underneath, your strokes coloured by how well each matched
    ctx.clearRect(0, 0, W2, W2); drawModel(0.18);
    strokes.forEach((st, j) => {
      const sc = r.userScore[j];
      line(st, sc == null ? getComputedStyle(document.body).getPropertyValue("--muted").trim() : resolveColor(scoreColor(sc)), 14);
    });
    $t("[data-tdraw]").hidden = true;
    const issues = [];
    r.strokes.forEach(x => {
      const n = x.ref + 1;
      if (x.missing) issues.push(`Stroke ${n} is missing`);
      else {
        if (x.outOfOrder) issues.push(`Stroke ${n} out of order — you wrote it ${ordinal(x.user + 1)}`);
        if (x.backwards) issues.push(`Stroke ${n} drawn in the wrong direction`);
        if (x.score < 0.45) issues.push(`Stroke ${n} is off in shape or position`);
      }
    });
    if (r.extra.length) issues.push(`${r.extra.length} extra stroke${r.extra.length > 1 ? "s" : ""}`);
    const prevBest = rec?.best ?? null;
    const newBest = !peeked && r.score > 0 && (prevBest === null || r.score > prevBest);
    const last = idx === chars.length - 1;
    const wordAvg = multi && last ? Math.round(wordScores.reduce((a, b) => a + b, 0) / wordScores.length) : null;
    $t("[data-tresult]").innerHTML = `
      <div class="t-score" style="--c:${scoreColor(r.score / 100)}"><b>${r.score}</b><span>/100</span></div>
      <div class="center"><b>${verdict(r.score)}</b>${peeked ? ` <span class="muted small">(peeked)</span>` : newBest && prevBest !== null ? ` <span class="t-best">New best!</span>` : ""}
        <span class="hz-inline t-answer">${esc(c)}</span></div>
      <div class="t-stats">
        <span>Strokes <b>${r.expected - r.missing}/${r.expected}</b>${r.extra.length ? ` +${r.extra.length}` : ""}</span>
        <span>Shape <b>${Math.round(r.shape * 100)}%</b></span>
        <span>Order <b>${r.outOfOrder ? `${r.outOfOrder} off` : "✓"}</b></span>
        <span>Direction <b>${r.backwards ? `${r.backwards} off` : "✓"}</b></span>
      </div>
      ${issues.length ? `<ul class="t-issues">${issues.slice(0, 5).map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : `<div class="center muted small">No mistakes found 🎯</div>`}
      ${wordAvg !== null ? `<div class="center t-word">${esc(word)} overall: <b>${wordAvg}</b>/100</div>` : ""}
      <div class="anim-row t-anim" hidden></div>
      <div class="row">
        <button class="btn ghost small" data-watch>▶ Stroke order</button>
        <button class="btn ghost small" data-retry>Try again</button>
        <button class="btn primary small" data-next>${multi && !last ? "Next character →" : "Next →"}</button>
      </div>`;
    $t("[data-watch]").onclick = () => { const a = $t(".t-anim"); a.hidden = false; animateWord(a, c); };
    $t("[data-retry]").onclick = () => { if (multi) wordScores.pop(); testChar(host, chars, idx, { onDone, onNextChar, onFinish, wordScores }); };
    $t("[data-next]").onclick = () => multi && !last ? onNextChar() : onFinish();
    ensureVisible($t(".t-score"));
  };
}
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
/** Canvas can't use CSS variables directly: resolve var(--x) to its value. */
function resolveColor(v) {
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  return m ? getComputedStyle(document.body).getPropertyValue(m[1]).trim() : v;
}

/* ---------------- sentence writing ---------------- */
const SENT_MODES = { trace: "Trace", pinyin: "Pinyin cue", dictation: "Dictation" };
const SENT_HELP = {
  trace: "Outlines shown — copy the whole sentence stroke by stroke.",
  pinyin: "No outlines — write each character from its pinyin. Stuck? Tap Hint to see the outline.",
  dictation: "No outlines — listen and write. Pinyin shows after each character. Hint shows the outline.",
};
function sentenceChars(wid) {
  const out = [];
  for (const t of D.sentences[wid].toks) {
    if (t.p) { out.push({ c: t.w, given: true }); continue; }
    const cs = [...t.w], ps = sylls(t.py || "");
    cs.forEach((c, j) => out.push({ c, py: ps.length === cs.length ? ps[j] : (j ? "" : t.py || ""), given: !hasStrokes(c) }));
  }
  return out;
}
function sentencePool() {
  const learned = D.words.filter(w => D.sentences[w.id] && introduced(ik("w", w.id))).map(w => w.id);
  if (learned.length) return learned;
  // nothing learned yet: the first sentences in study order
  return D.order.filter(o => o.type === "word" && D.sentences[o.id]).slice(0, 15).map(o => o.id);
}

/** Write a whole example sentence, one character at a time, with the sentence shown as a strip of boxes above. */
function sentencePractice(el, wid, { mode = "pinyin", onNext = null } = {}) {
  const s = D.sentences[wid];
  const all = sentenceChars(wid);
  const targets = all.map((x, k) => x.given ? -1 : k).filter(k => k >= 0);
  el.innerHTML = `<div class="sp">
      <div class="seg sp-modes">${Object.entries(SENT_MODES).map(([m, l]) => `<button data-sm="${m}" class="${m === mode ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="muted small center">${esc(SENT_HELP[mode])}</div>
      <div class="sp-head"><div class="sp-en">${esc(s.en)}</div>${audioButtons("s", wid)}</div>
      <div class="sp-strip"></div>
    </div><div class="sp-writer"></div>`;
  const sp = $(".sp", el), strip = $(".sp-strip", el), wr = $(".sp-writer", el);
  el.querySelectorAll("[data-sm]").forEach(b => b.onclick = () => sentencePractice(el, wid, { mode: b.dataset.sm, onNext }));
  const drawStrip = cur => {
    strip.innerHTML = all.map((x, k) => {
      const ti = targets.indexOf(k);
      const done = x.given || ti < cur, isCur = ti === cur;
      const showPy = !x.given && (mode !== "dictation" || done);
      const showChar = done || mode === "trace";
      return `<span class="sp-c ${x.given ? "given" : done ? "done" : isCur ? "cur" : ""} ${!done && showChar ? "faint" : ""}">
        <small>${showPy ? esc(x.py) : "&nbsp;"}</small><b>${showChar ? esc(x.c) : ""}</b></span>`;
    }).join("");
  };
  if (mode === "dictation") play("s", wid, undefined, true);
  const text = targets.map(k => all[k].c).join("");
  quizWord(wr, text, {
    progress: false, focus: wr,
    outline: mode === "trace",
    onChar: drawStrip,
  }).then(({ mistakes }) => {
    wr.innerHTML = `<div class="sp-result">${mistakes ? `${mistakes} mistake${mistakes > 1 ? "s" : ""}` : "Perfect!"}</div>
      <div class="row"><button class="btn ghost" data-again>Again</button>${onNext ? `<button class="btn primary" data-next>Next sentence</button>` : ""}</div>`;
    $("[data-again]", wr).onclick = () => sentencePractice(el, wid, { mode, onNext });
    if (onNext) $("[data-next]", wr).onclick = () => onNext(mode);
    play("s", wid, undefined, true);
  });
  return sp;
}

/* ---------------- study session ---------------- */
let session = null;

function allCards() { return store.S().cards; }
function dueCards(now = Date.now()) {
  // pronunciation cards (p:...) have their own session
  return Object.entries(allCards()).filter(([id, c]) => c.due <= now && !id.startsWith("p:")).map(([id]) => id);
}
function nextNewItems(n) {
  const out = [];
  for (const o of D.order) {
    if (out.length >= n) break;
    const key = ik(o.type === "word" ? "w" : "c", o.id);
    if (!introduced(key)) out.push(key);
  }
  return out;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function startSession() {
  const due = shuffle(dueCards()).map(id => ({ kind: "card", id }));
  const fresh = nextNewItems(store.newLeftToday()).map(key => ({ kind: "intro", key }));
  // interleave: one new item after every 3 reviews, so new material mixes with old
  const q = [];
  while (due.length || fresh.length) {
    for (let k = 0; k < 3 && due.length; k++) q.push(due.shift());
    if (fresh.length) q.push(fresh.shift());
  }
  session = { q, done: 0, startedWith: q.length };
  nextCard();
}

/* ---------------- daily streak ---------------- */
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBefore = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
/** Study days as {"YYYY-MM-DD": cards}. Built once from the review log for progress made before streaks existed. */
function activityDays() {
  const S = store.S();
  if (!S.days) {
    S.days = {};
    for (const [ts] of S.log || []) { const k = dayKey(new Date(ts)); S.days[k] = (S.days[k] || 0) + 1; }
    for (const ts of Object.values(S.introduced)) if (+ts) S.days[dayKey(new Date(+ts))] ||= 1;
    store.save();
  }
  return S.days;
}
function markActive() { const d = activityDays(), k = dayKey(); d[k] = (d[k] || 0) + 1; }
/** Current streak counts today if you've studied, otherwise it's still alive from yesterday until midnight. */
function streakInfo() {
  const d = activityDays(), now = new Date();
  const todayDone = !!d[dayKey(now)];
  let n = 0;
  for (let i = todayDone ? 0 : 1; d[dayKey(daysBefore(now, i))]; i++) n++;
  let best = 0, run = 0, prev = null;
  for (const k of Object.keys(d).sort()) {
    const [y, m, dd] = k.split("-").map(Number), cur = new Date(y, m - 1, dd);
    run = prev && Math.round((cur - prev) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = cur;
  }
  return { n, todayDone, best: Math.max(best, n), today: d[dayKey(now)] || 0 };
}
function streakHTML() {
  const { n, todayDone, best, today } = streakInfo();
  const d = activityDays(), now = new Date();
  const week = [...Array(7)].map((_, i) => daysBefore(now, 6 - i));
  const msg = todayDone ? `Done for today · ${today} card${today === 1 ? "" : "s"}`
    : n ? "Study today to keep it going" : "Study today to start a streak";
  return `<section class="streak ${todayDone ? "on" : ""}">
    <div class="streak-main"><span class="flame">${todayDone ? "🔥" : n ? "⏳" : "🌱"}</span>
      <div><b>${n} day${n === 1 ? "" : "s"}</b><span>${msg}</span></div>
      ${best > 1 ? `<small>best ${best}</small>` : ""}</div>
    <div class="week">${week.map((day, i) => `<div class="${d[dayKey(day)] ? "hit" : ""} ${i === 6 ? "today" : ""}">
      <i></i><span>${"SMTWTFS"[day.getDay()]}</span></div>`).join("")}</div>
  </section>`;
}

/* ---------------- Bao, the mascot ---------------- */
let M = null;
const loadMascot = async () => M || (M = await fetch("data/mascot.json").then(r => r.json()).catch(() => null));
const pick = a => a[Math.floor(Math.random() * a.length)];
/** Days missed since the last study day (0 = studied today or yesterday). */
function daysMissed() {
  const keys = Object.keys(activityDays()).sort();
  if (!keys.length) return -1;
  const [y, m, d] = keys[keys.length - 1].split("-").map(Number);
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today - new Date(y, m - 1, d)) / 86400000) - 1);
}
function mascotState() {
  const { n, todayDone } = streakInfo(), missed = daysMissed();
  if (missed < 0) return { pool: "fresh", mood: "neutral", n, missed: 0 };
  if (todayDone) return { pool: n >= 3 && Math.random() < 0.4 ? "streak" : "done", mood: n >= 7 ? "ecstatic" : "happy", n, missed };
  if (missed === 0) return { pool: "pending", mood: "neutral", n, missed };
  return { pool: missed >= 7 ? "missed7" : missed >= 3 ? "missed3" : "missed1", mood: missed >= 3 ? "furious" : "annoyed", n, missed };
}
function fillLine(s, st) {
  const due = dueCards().length + pronDue().length;
  return s.replace(/\{streak\}/g, st.n).replace(/\{due\}/g, due).replace(/\{days\}/g, st.missed).replace(/\{hour\}/g, new Date().getHours() + ":00");
}
/** Bao with a speech bubble. pool overrides the automatic choice (e.g. "session"). */
function mascotOn() { return !!M && store.S().settings.mascot !== false; }
function mascotHTML(pool) {
  if (!mascotOn()) return "";
  const st = mascotState(), hr = new Date().getHours();
  let mood = pool === "session" ? "session" : st.mood, linePool = pool || st.pool;
  if (!pool && (hr >= 23 || hr < 5) && mood !== "furious") { mood = "sleepy"; if (M.lines.night && Math.random() < .6) linePool = "night"; }
  const base = bao.BASE[mood] || "neutral";
  const line = fillLine(pick(M.lines[linePool] || M.lines.done), st);
  return `<section class="mascot" data-mascot="${pool || ""}" data-mood="${mood}" data-base="${base}" data-enter="${pool === "session" ? "flip" : "peek"}">${bao.svg(base)}
    <div class="bubble"><b>${esc(M.name)}</b><span>${esc(line)}</span></div></section>`;
}
/** What Bao says when tapped: pool = "poke" | "pokeMad" | "squish" | "wake", or nothing for his usual lines. */
function mascotLine(sec, pool) {
  if (!M) return "";
  const st = mascotState();
  return fillLine(pick(M.lines[pool] || M.lines[sec.dataset.mascot || st.pool] || M.lines.done), st);
}
bao.watch(mascotLine);

// the little Bao in the corner reacting to answers
let combo = 0;
const CHEER = ["好!", "对!", "棒!", "厉害!", "Nice!", "Yes!", "不错!"], OOPS = ["哎呀!", "不对…", "啊?", "Oof.", "加油!", "Again…"];
function baoReact(good, big = false) {
  if (!mascotOn()) return;
  combo = good ? combo + 1 : 0;
  if (good && combo > 0 && combo % 5 === 0) return bao.pop(pick(["celebrate", "starstruck", "ecstatic"]), `${combo} in a row! 厉害!`);
  if (big) return bao.pop(good ? pick(["celebrate", "starstruck", "proud", "love"]) : pick(["crying", "shocked", "ko"]), good ? pick(CHEER) : pick(OOPS));
  if (Math.random() > (good ? .22 : .45)) return;
  bao.pop(good ? pick(["happy", "proud", "wink", "laughing", "cool", "love", "ecstatic", "starstruck", "munching"])
    : pick(["shocked", "confused", "sad", "nervous", "dizzy", "pleading", "embarrassed", "disgusted"]), good ? pick(CHEER) : pick(OOPS));
}

/* ---------------- Meet Bao: every face and move ---------------- */
function renderBaoGallery() {
  const faces = Object.keys(bao.FACES).filter(f => !["achoo", "sneezy"].includes(f));
  const nice = f => f.replace(/^ko$/, "KO").replace(/^./, c => c.toUpperCase());
  view().innerHTML = `${simpleHeader("Meet Bao")}<main class="card">
    <div class="bao-stage">${bao.svg("happy")}</div><div class="bao-stage-name">Happy</div>
    <p class="muted small center">${faces.length} faces and ${Object.keys(bao.MOVES).length} moves. Tap one to try it. On the home screen, tap Bao, poke him a lot, or press and hold.</p>
    <div class="label">Faces</div>
    <div class="bao-grid">${faces.map(f => `<button data-face="${f}">${bao.svg(f)}<span>${nice(f)}</span></button>`).join("")}</div>
    <div class="label" style="margin-top:14px">Moves</div>
    <div class="bao-moves">${Object.keys(bao.MOVES).map(m => `<button data-move="${m}">${m}</button>`).join("")}</div>
  </main>`;
  bindHome(view());
  const stage = $(".bao-stage svg"), name = $(".bao-stage-name");
  view().querySelectorAll("[data-face]").forEach(b => b.onclick = () => {
    const f = b.dataset.face;
    if (f === "sneezy") return;
    bao.setFace(stage, f); name.textContent = nice(f); bao.move(stage, bao.FACE_MOVE[f] || "bounce");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  view().querySelectorAll("[data-move]").forEach(b => b.onclick = () => {
    if (b.dataset.move === "squish") { bao.move(stage, "squish"); setTimeout(() => { stage.classList.remove("a-squish"); bao.move(stage, "boing"); }, 700); }
    else bao.move(stage, b.dataset.move);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
/** Red number on the home-screen icon = cards due (vocabulary + sounds). */
function updateBadge() {
  try {
    const n = dueCards().length + pronDue().length;
    if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge();
  } catch {}
}

function introduce(key) {
  const S = store.S(), now = Date.now(), type = key[0], id = key.slice(2);
  S.introduced[key] = now;
  S.daily.newCount++;
  markActive();
  const facets = FACETS[type].filter(f => f !== "write" || [...id].some(hasStrokes));
  const added = [];
  for (const f of facets) {
    // read + write today (in this session); listen + tones start tomorrow
    const later = f === "listen" || f === "tones";
    const cid = `${key}:${f}`;
    if (!S.cards[cid]) S.cards[cid] = newCard(later ? now + 20 * 3600000 : now);
    if (!later) added.push(cid);
  }
  store.save();
  // show today's facets a little later in the session, not immediately
  added.forEach((cid, i) => session.q.splice(Math.min(session.q.length, 2 + i * 3), 0, { kind: "card", id: cid }));
}

function nextCard() {
  // the previous card scrolled down to its grade buttons; start every card at the top
  window.scrollTo(0, 0);
  const item = session.q.shift();
  if (!item) return renderDone();
  if (item.kind === "intro") return renderIntro(item.key);
  if (!allCards()[item.id]) return nextCard();
  renderCard(item.id);
}

function grade(cid, g) {
  const S = store.S();
  S.cards[cid] = review(S.cards[cid], g);
  S.log.push([Date.now(), cid, g]);
  if (S.log.length > 5000) S.log.splice(0, S.log.length - 5000);
  markActive();
  store.save();
  session.done++;
  baoReact(g >= 3);
  if (g === 1) session.q.splice(Math.min(session.q.length, 4), 0, { kind: "card", id: cid }); // see it again soon
  nextCard();
}

function header(title) {
  const left = session ? session.q.length + 1 : 0;
  return `<header class="bar"><button class="icon-btn" data-home aria-label="Home">‹</button>
    <div class="bar-title">${esc(title)}</div><div class="muted small">${left} left</div></header>`;
}

function gradeBar(cid, suggested) {
  const p = preview(allCards()[cid]);
  const names = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };
  return `<div class="grades">${[1, 2, 3, 4].map(g => `<button class="grade g${g} ${suggested === g ? "suggested" : ""}" data-grade="${g}">
    <span>${names[g]}</span><small>${p[g]}</small></button>`).join("")}</div>`;
}
function bindGrades(el, cid) {
  el.querySelectorAll("[data-grade]").forEach(b => b.onclick = () => grade(cid, +b.dataset.grade));
}

function renderIntro(key) {
  const it = itemInfo(key);
  const el = view();
  el.innerHTML = `${header("New")}
    <main class="card intro">
      <div class="badge new">${it.type === "w" ? "new word" : "new component"}</div>
      ${answerHTML(key)}
      <div class="label">Stroke order</div>
      <div class="anim-row"></div>
      <button class="btn primary full" data-gotit>Got it</button>
    </main>`;
  animateWord($(".anim-row", el), it.text);
  if (store.S().settings.autoplay) play(it.type, it.text, null, true);
  $("[data-gotit]", el).onclick = () => { introduce(key); nextCard(); };
  bindHome(el);
}

function renderCard(cid) {
  const [type, , facet] = [cid[0], null, cid.split(":").pop()];
  const key = cid.slice(0, cid.lastIndexOf(":"));
  const it = itemInfo(key);
  const el = view();
  const autoplay = store.S().settings.autoplay;
  const title = `${FACET_LABEL[facet]}${it.type === "c" ? " · component" : ""}`;
  let front = "";
  if (facet === "read") front = hanziHTML(it.text, { tappable: false }) + (it.type === "w" ? tradHTML(it.w) : "");
  else if (facet === "listen") front = `<button class="big-play" data-play="w|${esc(it.text)}|">🔊</button><div class="muted center">What did you hear?</div>`;
  else if (facet === "write") front = `<div class="prompt">${esc(meaningOf(key))}</div>
      ${it.type === "w" ? `<div class="py-line center">${pinyinHTML(it.w.py, it.w.num)} ${audioButtons("w", it.text)}</div>` : ""}
      <div class="write-area"></div>`;
  else if (facet === "tones") front = hanziHTML(it.text, { tappable: false }) + `<div class="prompt">${esc(meaningOf(key))}</div>
      <div class="tone-pick">${sylls(it.w.py).map((s, i) => `<div class="tone-row" data-i="${i}">
        ${[1, 2, 3, 4, 5].map(t => `<button class="tone-btn t${t}" data-t="${t}">${["ˉ", "ˊ", "ˇ", "ˋ", "·"][t - 1]}</button>`).join("")}</div>`).join("")}</div>
      <button class="btn primary full" data-check>Check</button>`;

  el.innerHTML = `${header(title)}<main class="card"><div class="front">${front}</div>
    <div class="back" hidden></div>
    <button class="btn primary full" data-reveal ${facet === "tones" || facet === "write" ? "hidden" : ""}>Show answer</button>
    <div class="grade-slot"></div></main>`;
  bindHome(el);
  const reveal = (suggested) => {
    $(".back", el).hidden = false;
    $(".back", el).innerHTML = answerHTML(key, { showHanzi: facet !== "read" && facet !== "tones" });
    $("[data-reveal]", el).hidden = true;
    $(".grade-slot", el).innerHTML = gradeBar(cid, suggested);
    bindGrades(el, cid);
    if (autoplay && facet !== "listen") play(it.type, it.text, null, true);
    $(".grade-slot", el).scrollIntoView({ behavior: "smooth", block: "end" });
  };
  $("[data-reveal]", el).onclick = () => reveal();

  if (facet === "listen") setTimeout(() => play("w", it.text), 200);
  if (facet === "write") {
    const area = $(".write-area", el);
    if (store.S().settings.writeMode === "free") {
      freePad(area);
      $("[data-reveal]", el).hidden = false;
      $("[data-reveal]", el).onclick = () => { reveal(); const a = h(`<div class="anim-row"></div>`); $(".back", el).prepend(a); animateWord(a, it.text); };
    } else {
      quizWord(area, it.text).then(({ mistakes }) => {
        const nchars = [...it.text].length;
        const g = mistakes === 0 ? 3 : mistakes <= nchars * 2 ? 2 : 1;
        area.insertAdjacentHTML("afterbegin", `<div class="result ${g === 3 ? "ok" : "meh"}">${mistakes === 0 ? "Perfect!" : `${mistakes} mistake${mistakes > 1 ? "s" : ""}`}</div>`);
        reveal(g);
      });
    }
  }
  if (facet === "tones") {
    el.querySelectorAll(".tone-row").forEach(row => row.onclick = e => {
      const b = e.target.closest(".tone-btn"); if (!b) return;
      row.querySelectorAll(".tone-btn").forEach(x => x.classList.toggle("sel", x === b));
    });
    $("[data-check]", el).onclick = () => {
      const want = tones(it.w.num);
      let ok = true;
      el.querySelectorAll(".tone-row").forEach((row, i) => {
        const sel = +row.querySelector(".sel")?.dataset.t || 0;
        row.querySelectorAll(".tone-btn").forEach(x => {
          x.classList.toggle("right", +x.dataset.t === want[i]);
          x.classList.toggle("wrong", x.classList.contains("sel") && +x.dataset.t !== want[i]);
        });
        if (sel !== want[i]) ok = false;
      });
      $("[data-check]", el).hidden = true;
      reveal(ok ? 3 : 1);
    };
  }
}

function renderDone() {
  const n = session?.done || 0;
  session = null;
  view().innerHTML = `<main class="card done"><div class="hz big">好</div>
    <h2>All done for now</h2><p class="muted">${n} review${n === 1 ? "" : "s"} this session.</p>
    ${mascotHTML("session")}
    ${streakHTML()}
    <button class="btn primary full" data-home>Home</button></main>`;
  bindHome(view());
}

/* ---------------- bottom sheet: breakdown + card details ---------------- */
let sheetStack = [];
function openSheet(entry) { sheetStack.push(entry); renderSheet(); }
function closeSheet() { sheetStack = []; $("#sheet").hidden = true; document.body.classList.remove("sheet-open"); }
function renderSheet() {
  const sh = $("#sheet");
  const e = sheetStack[sheetStack.length - 1];
  if (!e) return closeSheet();
  sh.hidden = false; document.body.classList.add("sheet-open");
  const body = e.type === "char" ? charSheet(e.c) : e.type === "preview" ? previewSheet(e.c) : e.type === "syl" ? sylSheet(e.s)
    : e.type === "sentence" ? `<div class="sp-host"></div>` : e.type === "drill" ? `<div class="drill-host"></div>` : itemSheet(e.key);
  const crumb = x => x.type === "char" || x.type === "preview" ? x.c : x.type === "syl" ? marked(x.s) : x.type === "sentence" ? "✍️ sentence"
    : x.type === "drill" ? `✍️ ${x.text}` : x.key.slice(2);
  sh.innerHTML = `<div class="sheet-scrim" data-close></div><div class="sheet-panel">
    <div class="sheet-bar">${sheetStack.length > 1 ? `<button class="icon-btn" data-back aria-label="Back">‹</button>` : `<span></span>`}
    <div class="crumbs">${sheetStack.map(x => esc(crumb(x))).join(" › ")}</div>
    <button class="icon-btn" data-close aria-label="Close">✕</button></div><div class="sheet-body">${body}</div></div>`;
  sh.querySelectorAll("[data-close]").forEach(b => b.onclick = closeSheet);
  const back = $("[data-back]", sh); if (back) back.onclick = () => { sheetStack.pop(); renderSheet(); };
  const anim = $(".anim-row", sh); if (anim) animateWord(anim, anim.dataset.text);
  const pr = $("[data-practice]", sh);
  if (pr) pr.onclick = () => openSheet({ type: "drill", text: pr.dataset.practice });
  const dh = $(".drill-host", sh); if (dh) startDrill(dh, e.text);
  const host = $(".sp-host", sh);
  if (host) {
    const next = mode => { const pool = sentencePool().filter(w => w !== e.wid); e.wid = pool[Math.floor(Math.random() * pool.length)] || e.wid; sentencePractice(host, e.wid, { mode, onNext: next }); };
    sentencePractice(host, e.wid, { mode: e.mode || "pinyin", onNext: next });
  }
}
function charSheet(c) {
  const info = D.chars[c] || {};
  const key = itemForChar(c);
  const w = words[c];
  const etym = info.etym === "pictophonetic" && (info.semantic || info.phonetic)
    ? `<div class="hint">Meaning from <a href="#" data-char="${esc(info.semantic)}">${esc(info.semantic)}</a>, sound from <a href="#" data-char="${esc(info.phonetic)}">${esc(info.phonetic)}</a>${info.hint ? ` — ${esc(info.hint)}` : ""}</div>`
    : info.hint ? `<div class="hint">${esc(info.hint)}</div>` : "";
  return `${hanziHTML(c, { tappable: false })}${w ? tradHTML(w) : ""}
    <div class="center">${charKnown(c) ? `<span class="badge known">learned</span>` : `<span class="badge">not learned yet</span>`}</div>
    ${w ? `<div class="py-line">${pinyinHTML(w.py, w.num)} ${audioButtons("w", c)}</div>` : info.py?.length ? `<div class="py-line"><span class="py">${esc(info.py.join(", "))}</span> ${audioButtons("c", c)}</div>` : ""}
    <div class="meaning">${esc(w ? w.en.join("; ") : info.def || "")}</div>
    ${etym}${partsHTML(c)}${usedInHTML(c)}
    ${hasStrokes(c) ? `<div class="anim-row" data-text="${esc(c)}"></div>` : ""}
    <div class="row">${key ? `<button class="btn" data-item="${esc(key)}">Open card${key.slice(2) !== c ? ` (${esc(key.slice(2))})` : ""}</button>` : ""}
      ${hasStrokes(c) ? `<button class="btn ghost" data-practice="${esc(c)}">Practice writing</button>` : ""}</div>
    `;
}
function itemSheet(key) {
  const it = itemInfo(key);
  const cards = FACETS[key[0]].map(f => [f, allCards()[`${key}:${f}`]]).filter(([, c]) => c);
  const status = cards.length ? `<div class="facets">${cards.map(([f, c]) => `<span class="facet">${FACET_LABEL[f]} <small>${dueLabel(c)}</small></span>`).join("")}</div>`
    : `<div class="center"><span class="badge">not learned yet</span></div>`;
  return `${answerHTML(key)}${status}
    ${[...it.text].some(hasStrokes) ? `<div class="anim-row" data-text="${esc(it.text)}"></div>
    <div class="row"><button class="btn ghost" data-practice="${esc(it.text)}">Practice writing</button></div>` : ""}`;
}
function dueLabel(c) {
  const ms = c.due - Date.now();
  if (c.state === "new") return "new";
  if (ms <= 0) return "due";
  const d = Math.round(ms / 86400000);
  return d < 1 ? "today" : `in ${d}d`;
}

/* ---------------- character chart ---------------- */
let CL = null, L1 = null, chartZoom = 1, chartScroll = 0;
const loadCharLevels = async () => CL || (CL = await fetch("data/charlevels.json").then(r => r.json()));
const TIER_LABEL = ["not yet", "new", "learning", "solid (3+ weeks)"];

/** Level-1 characters in study order (the same order the chart fills in). */
function level1Chars() {
  if (!L1) {
    const seen = new Set();
    for (const o of D.order) if (o.type === "word") for (const c of words[o.id].s) if (D.chars[c]) seen.add(c);
    L1 = [...seen];
  }
  return L1;
}

/** Memory tier per character from the strongest read/write card that contains it:
 *  1 = introduced, 2 = remembered 3+ days, 3 = remembered 3+ weeks. Characters you haven't met are absent (tier 0). */
function charTiers() {
  const best = {};
  for (const key of Object.keys(store.S().introduced)) for (const c of key.slice(2)) best[c] ??= 0;
  for (const [id, card] of Object.entries(allCards())) {
    if (!/:(read|write)$/.test(id)) continue;
    for (const c of id.slice(2, id.lastIndexOf(":"))) best[c] = Math.max(best[c] ?? 0, card.s || 0);
  }
  const t = {};
  for (const [c, s] of Object.entries(best)) t[c] = s >= 21 ? 3 : s >= 3 ? 2 : 1;
  return t;
}

/** Most recently introduced characters, newest first. */
function recentChars(n) {
  const when = {};
  for (const [key, ts] of Object.entries(store.S().introduced)) for (const c of key.slice(2)) if (D.chars[c] && level1Chars().includes(c)) when[c] = Math.max(when[c] || 0, +ts || 0);
  return Object.keys(when).sort((a, b) => when[b] - when[a]).slice(0, n);
}

function homeChartHTML() {
  const chars = level1Chars(), t = charTiers();
  const met = chars.filter(c => t[c]).length;
  const recent = recentChars(10);
  return `<button class="charmap" data-chart aria-label="Open character chart">
    <div class="charmap-head"><b>Characters</b><span>${met} / ${chars.length} · HSK 1</span><span class="chev">›</span></div>
    <div class="charmap-grid">${chars.map(c => `<i class="k${t[c] || 0}"></i>`).join("")}</div>
    ${recent.length ? `<div class="charmap-recent"><span class="muted small">Latest</span> ${recent.map(c => `<span class="k${t[c]}">${esc(c)}</span>`).join("")}</div>`
      : `<div class="muted small">Characters light up here as you learn them.</div>`}
  </button>`;
}

const ZOOM_SIZE = [0, 44, 34, 27, 21, 17, 14, 11];   // tile size (px) when showing 1..7 levels
async function renderChart() {
  const data = await loadCharLevels();
  const lv = data.levels, max = lv.length;
  chartZoom = Math.min(Math.max(chartZoom, 1), max);
  const t = charTiers(), sz = ZOOM_SIZE[chartZoom], showText = sz >= 17;
  const shown = lv.slice(0, chartZoom);
  const total = shown.reduce((n, l) => n + l.chars.length, 0);
  const met = shown.reduce((n, l) => n + [...l.chars].filter(c => t[c]).length, 0);
  const range = chartZoom === 1 ? "HSK 1" : `HSK 1–${lv[chartZoom - 1].label.replace("HSK ", "").split("–").pop()}`;
  view().innerHTML = `${simpleHeader("Character chart")}<main class="chart-wrap">
    <div class="chart-bar">
      <button class="icon-btn zoom" data-zoom="1" ${chartZoom === max ? "disabled" : ""} aria-label="Zoom out">−</button>
      <div class="chart-range"><b>${range}</b><span>${met} / ${total} characters</span></div>
      <button class="icon-btn zoom" data-zoom="-1" ${chartZoom === 1 ? "disabled" : ""} aria-label="Zoom in">+</button>
    </div>
    <div class="legend">${[0, 1, 2, 3].map(k => `<span><i class="k${k}"></i>${TIER_LABEL[k]}</span>`).join("")}</div>
    <div class="chart ${showText ? "" : "dots"}" style="--sz:${sz}px">
      ${shown.map(l => {
        const m = [...l.chars].filter(c => t[c]).length;
        return `<section><h3>${esc(l.label)} <small>${m} / ${l.chars.length}</small></h3>
          <div class="cg">${[...l.chars].map(c => `<button class="ct k${t[c] || 0}" data-ct="${esc(c)}">${showText ? esc(c) : ""}</button>`).join("")}</div></section>`;
      }).join("")}
      ${chartZoom < max ? `<button class="btn ghost full more-levels" data-zoom="1">Zoom out to include ${esc(lv[chartZoom].label)} ›</button>` : ""}
    </div>
    <div class="muted small center pinch-hint">Pinch or use − / + to zoom</div></main>`;
  bindHome(view());
  const chart = $(".chart");
  view().querySelectorAll("[data-zoom]").forEach(b => b.onclick = () => zoomChart(+b.dataset.zoom));
  chart.onclick = e => {
    const b = e.target.closest("[data-ct]"); if (!b) return;
    const c = b.dataset.ct;
    openSheet(D.chars[c] ? { type: "char", c } : { type: "preview", c });
  };
  pinchToZoom(chart);
  window.scrollTo(0, chartScroll);
}
function zoomChart(dir) {
  const next = chartZoom + dir;
  if (next < 1 || next > (CL?.levels.length || 7)) return;
  chartZoom = next; chartScroll = 0;
  renderChart();
}
/** Two-finger pinch: spread fingers to zoom in (fewer levels, bigger tiles), pinch together to zoom out. */
function pinchToZoom(el) {
  let start = 0, done = false;
  const dist = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
  el.addEventListener("touchstart", e => { if (e.touches.length === 2) { start = dist(e.touches); done = false; } }, { passive: true });
  el.addEventListener("touchmove", e => {
    if (e.touches.length !== 2 || !start) return;
    e.preventDefault();
    const r = dist(e.touches) / start;
    if (!done && (r > 1.35 || r < 0.74)) { done = true; zoomChart(r > 1 ? -1 : 1); }
  }, { passive: false });
  el.addEventListener("touchend", () => { start = 0; });
  ["gesturestart", "gesturechange"].forEach(n => el.addEventListener(n, e => e.preventDefault()));
}
function previewSheet(c) {
  const [py, def, ex] = CL?.info?.[c] || [];
  const lvl = CL?.levels.find(l => l.chars.includes(c));
  return `<div class="hz big"><span>${esc(c)}</span></div>
    ${py ? `<div class="py-line"><span class="py">${esc(py)}</span></div>` : ""}
    <div class="meaning">${esc(def || "")}</div>
    ${ex ? `<div class="center muted">as in <b class="hz-inline">${esc(ex)}</b></div>` : ""}
    <div class="center" style="margin-top:12px"><span class="badge">${esc(lvl?.label || "")} · coming later</span></div>`;
}

/* ---------------- home / browse / settings / pad ---------------- */
function bindHome(el) { el.querySelectorAll("[data-home]").forEach(b => b.onclick = () => { session = null; renderHome(); }); }

function renderHome() {
  const S = store.S();
  const due = dueCards().length;
  const left = store.newLeftToday();
  const total = D.order.length;
  const learned = Object.keys(S.introduced).length;
  // today's workload: cards reviewed since midnight vs. those plus what's still waiting (due + new)
  const midnight = new Date().setHours(0, 0, 0, 0);
  const doneToday = S.log.filter(([t, id]) => t >= midnight && !String(id).startsWith("p:")).length;
  const todo = doneToday + due + Math.min(left, total - learned);
  const pct = todo ? Math.floor(doneToday / todo * 100) : 100;
  view().innerHTML = `<main class="home">
    <h1>HSK Tutor</h1>
    ${mascotHTML()}
    ${streakHTML()}
    <nav class="levels">${[1, 2, 3, 4, 5, 6].map(l => `<button class="level ${l === 1 ? "on" : ""}" ${l === 1 ? "" : "disabled"}>HSK ${l}${l === 1 ? "" : "<small>soon</small>"}</button>`).join("")}</nav>
    <section class="stats">
      <div><b>${due}</b><span>due</span></div>
      <div><b>${Math.min(left, total - learned)}</b><span>new today</span></div>
      <div><b>${learned}</b><span>of ${total} learned</span></div>
    </section>
    <div class="today-bar">
      <div class="today-label"><span>Today</span><span>${pct === 100 ? (doneToday ? `All done ✓ <b>${doneToday}</b> reviewed` : "Nothing to study") : `<b>${doneToday}</b> of <b>${todo}</b> done`}</span></div>
      <div class="progress ${pct === 100 ? "full" : ""}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Today's study progress"><div style="width:${pct}%"></div></div>
    </div>
    <button class="btn primary full big" data-study ${due + left === 0 ? "disabled" : ""}>${due + left === 0 ? "Nothing due — come back later" : "Study"}</button>
    ${homeChartHTML()}
    <div class="tiles">
      <button class="tile" data-go="pad">✍️<span>Writing pad</span></button>
      <button class="tile" data-go="pron">🗣️<span>Pronunciation</span></button>
      <button class="tile" data-go="browse">📚<span>Browse</span></button>
      <button class="tile" data-go="settings">⚙️<span>Settings</span></button>
    </div>
  </main>`;
  $("[data-study]").onclick = startSession;
  updateBadge();
  $("[data-chart]").onclick = () => { chartScroll = 0; renderChart(); };
  view().querySelectorAll("[data-go]").forEach(b => b.onclick = () => ({ pad: () => renderPad(), pron: () => renderPron(), browse: renderBrowse, settings: renderSettings })[b.dataset.go]());
}

function simpleHeader(title) {
  return `<header class="bar"><button class="icon-btn" data-home aria-label="Home">‹</button><div class="bar-title">${esc(title)}</div><span></span></header>`;
}

/* ---------------- pronunciation: tones, pinyin chart, sound flashcards ---------------- */
let P = null, psession = null, pronTab = "practice";
const loadPinyin = async () => P || (P = await fetch("data/pinyin.json").then(r => r.json()));
const MARKS = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", v: "ǖǘǚǜ" };
/** "lv3" -> "lǚ", "zhong1" -> "zhōng", "ma" (no tone) -> "ma" */
function marked(id) {
  const m = /^([a-zv]+)([1-5])?$/.exec(id); if (!m) return id;
  let [, s, t] = m; t = +t || 5;
  let at = -1;
  if (t <= 4) {
    if (s.includes("a")) at = s.indexOf("a"); else if (s.includes("e")) at = s.indexOf("e");
    else if (s.includes("ou")) at = s.indexOf("o");
    else for (let i = s.length - 1; i >= 0; i--) if ("iouv".includes(s[i])) { at = i; break; }
  }
  return [...s].map((c, i) => i === at ? MARKS[c][t - 1] : c === "v" ? "ü" : c).join("");
}
const sylTone = id => +id.slice(-1);
const sylBase = id => id.replace(/[1-5]$/, "");
const hasP = id => hasAudio("p", id);
const TONES = [
  { t: 1, name: "1st · high & level", how: "Hold one high, steady pitch, like singing a note.", ex: "ma1", word: "妈 mother", path: "M6 10 L54 10" },
  { t: 2, name: "2nd · rising", how: "Rise from middle to high, like asking “huh?”", ex: "ma2", word: "麻 hemp", path: "M6 30 L54 8" },
  { t: 3, name: "3rd · low dip", how: "Drop low and stay low; it only rises at the end of a phrase.", ex: "ma3", word: "马 horse", path: "M6 22 Q22 44 38 36 T54 14" },
  { t: 4, name: "4th · falling", how: "Fall sharply from high to low, like a firm “No!”", ex: "ma4", word: "骂 scold", path: "M6 6 L54 40" },
  { t: 5, name: "Neutral · light & short", how: "Unstressed and quick; its pitch depends on the tone before it.", ex: null, word: "吗 (question particle)", path: "M26 24 L34 24" },
];
const toneSVG = (path, t) => `<svg class="tone-svg t${t}" viewBox="0 0 60 46"><path d="M0 2H60M0 23H60M0 44H60" class="grid"/><path d="${path}" class="line"/></svg>`;

function pronDue() {
  const now = Date.now();
  return Object.entries(allCards()).filter(([id, c]) => id.startsWith("p:") && c.due <= now).map(([id]) => id);
}
function pronNewLeft() {
  const S = store.S(), d = store.today();
  if (!S.pdaily || S.pdaily.date !== d) S.pdaily = { date: d, newCount: 0 };
  return Math.max(0, (S.settings.pronNewPerDay ?? 10) - S.pdaily.newCount);
}
const pronLearned = () => Object.keys(store.S().pintro || {}).length;

async function renderPron(tab = pronTab) {
  pronTab = tab;
  await loadPinyin();
  const tabs = `<div class="seg">${[["practice", "Practice"], ["tones", "Tones"], ["chart", "Pinyin chart"]]
    .map(([k, l]) => `<button data-ptab="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")}</div>`;
  let body = "";
  if (tab === "practice") {
    const due = pronDue().length, left = Math.min(pronNewLeft(), P.hsk1.length - pronLearned());
    body = `<p class="muted small">Train your ear on the ${P.hsk1.length} syllable + tone sounds used in HSK 1, starting with the most common.
      Each sound gets two cards: <b>which tone?</b> and <b>which syllable?</b> (picked from look-alikes like zh/j/z or an/ang).</p>
      <section class="stats"><div><b>${due}</b><span>due</span></div><div><b>${left}</b><span>new today</span></div>
        <div><b>${pronLearned()}</b><span>of ${P.hsk1.length} sounds</span></div></section>
      <button class="btn primary full big" data-pstart ${due + left ? "" : "disabled"}>${due + left ? "Practice sounds" : "All done — come back later"}</button>`;
  } else if (tab === "tones") {
    body = `<div class="tone-list">${TONES.map(x => `<div class="tone-row-card">
        ${toneSVG(x.path, x.t)}
        <div><b class="t${x.t}">${x.t === 5 ? "ma" : marked(x.ex)}</b> <span class="muted small">${esc(x.word)}</span>
          <div class="small">${esc(x.name)}</div><div class="muted small">${esc(x.how)}</div></div>
        <button class="icon-btn" ${x.ex ? `data-play="p|${x.ex}|"` : `data-play="w|吗|"`} aria-label="Play">🔊</button></div>`).join("")}</div>
      <div class="label">Tone changes to know</div>
      <ul class="tips">
        <li><b>3 + 3 → 2 + 3.</b> Two 3rd tones in a row: the first becomes 2nd. 你好 nǐ hǎo is said <i>ní hǎo</i>.</li>
        <li><b>不 bù → bú</b> before a 4th tone: 不是 <i>bú shì</i>.</li>
        <li><b>一 yī</b> becomes <i>yí</i> before a 4th tone (一个 <i>yí ge</i>) and <i>yì</i> before other tones (一天 <i>yì tiān</i>).</li>
        <li><b>3rd tone</b> before 1st, 2nd or 4th: just the low part, no rise (很好 hěn hǎo, 我们 wǒmen).</li>
      </ul>`;
  } else {
    const ini = P.initials, fins = P.finals;
    body = `<p class="muted small">Tap a syllable to hear its four tones. Rows are finals, columns are initials (first column: no initial, written with y/w). Scroll sideways for more.</p>
      <div class="pchart-wrap"><table class="pchart"><thead><tr><th></th>${ini.map(i => `<th>${i || "∅"}</th>`).join("")}</tr></thead><tbody>
      ${fins.map(f => `<tr><th>${f.replace(/v/g, "ü")}</th>${ini.map(i => {
        const s = P.table[f]?.[i];
        return s ? `<td><button data-syl="${s}" class="${P.hsk1.some(x => sylBase(x) === s) ? "hsk" : ""}">${marked(s)}</button></td>` : "<td></td>";
      }).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="muted small"><span class="hsk-dot"></span> used in HSK 1</div>`;
  }
  view().innerHTML = `${simpleHeader("Pronunciation")}<main class="card pron">${tabs}${body}</main>`;
  bindHome(view());
  view().querySelectorAll("[data-ptab]").forEach(b => b.onclick = () => renderPron(b.dataset.ptab));
  const st = $("[data-pstart]"); if (st) st.onclick = startPronSession;
  view().querySelectorAll("[data-syl]").forEach(b => b.onclick = () => openSheet({ type: "syl", s: b.dataset.syl }));
}
function sylSheet(s) {
  return `<div class="hz big"><span class="py-big">${marked(s)}</span></div>
    <div class="tone-btns">${[1, 2, 3, 4].map(t => {
      const id = s + t, ok = hasP(id);
      return `<button class="tone-play t${t}" ${ok ? `data-play="p|${id}|"` : "disabled"}>${marked(id)}<small>${ok ? "🔊" : "—"}</small></button>`;
    }).join("")}</div>
    ${[1, 2, 3, 4].map(t => (P.examples[s + t] || []).length ? `<div class="py-ex"><b class="t${t}">${marked(s + t)}</b> ${P.examples[s + t]
      .map(w => `<a href="#" class="chip" data-item="${esc(ik("w", w))}">${esc(w)}</a>`).join("")}</div>` : "").join("")}
    <p class="muted small center">— means that tone isn't used in Mandarin for this syllable${Object.keys(P.sample).some(k => sylBase(k) === s && !hasP(k)) ? ", or its audio is still being recorded" : ""}.</p>`;
}

/* pronunciation session: new sounds are introduced, then quizzed by ear */
const CONF_INI = [["zh", "z", "j"], ["ch", "c", "q"], ["sh", "s", "x"], ["n", "l", "r"], ["f", "h"], ["b", "p"], ["d", "t"], ["g", "k"], ["m", "n"]];
const CONF_FIN = [["an", "ang"], ["en", "eng"], ["in", "ing"], ["ian", "iang"], ["uan", "uang"], ["un", "ong"], ["ie", "ian"], ["u", "v"], ["ou", "uo"], ["ei", "ai"], ["iu", "iao"], ["e", "o"]];
function sylParts(s) {
  for (const [f, row] of Object.entries(P.table)) for (const [i, v] of Object.entries(row)) if (v === s) return [i, f];
  return ["", s];
}
function soundOptions(id) {
  const t = sylTone(id), base = sylBase(id), [ini, fin] = sylParts(base);
  const out = new Set();
  const add = (i, f) => { const s = P.table[f]?.[i]; if (s && s !== base) out.add(s); };
  for (const g of CONF_INI) if (g.includes(ini)) g.forEach(x => add(x, fin));
  for (const g of CONF_FIN) if (g.includes(fin)) g.forEach(x => add(ini, x));
  const pool = Object.values(P.table).flatMap(r => Object.values(r)).filter(s => s !== base && (s.startsWith(ini || s[0]) || s.endsWith(fin)));
  while (out.size < 6 && pool.length) out.add(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const picks = shuffle([...out]).slice(0, 3).map(s => s + t);
  return shuffle([id, ...picks]);
}
function startPronSession() {
  const due = shuffle(pronDue()).map(id => ({ kind: "pcard", id }));
  const S = store.S(), intro = S.pintro || {};
  const fresh = P.hsk1.filter(id => !intro[id] && hasP(id)).slice(0, pronNewLeft()).map(id => ({ kind: "pintro", id }));
  const q = [];
  while (due.length || fresh.length) { for (let k = 0; k < 3 && due.length; k++) q.push(due.shift()); if (fresh.length) q.push(fresh.shift()); }
  if (!q.length) return toast("Nothing to practice right now — audio may still be downloading");
  psession = { q, done: 0 };
  nextPron();
}
function nextPron() {
  window.scrollTo(0, 0);
  const it = psession.q.shift();
  if (!it) { psession = null; view().innerHTML = `<main class="card done"><div class="hz big">好</div><h2>Ears trained!</h2>${mascotHTML("session")}${streakHTML()}
      <button class="btn primary full" data-pback>Back to pronunciation</button></main>`; $("[data-pback]").onclick = () => renderPron("practice"); return; }
  if (it.kind === "pintro") return pronIntro(it.id);
  pronCard(it.id);
}
const pheader = title => `<header class="bar"><button class="icon-btn" data-pexit aria-label="Back">‹</button><div class="bar-title">${esc(title)}</div><div class="muted small">${psession.q.length + 1} left</div></header>`;
function bindPexit() { $("[data-pexit]").onclick = () => { psession = null; renderPron("practice"); }; }
function pronIntro(id) {
  const ex = P.examples[id] || [];
  view().innerHTML = `${pheader("New sound")}<main class="card intro">
    <div class="badge new">new sound</div>
    <div class="hz big"><span class="py-big t${sylTone(id)}">${marked(id)}</span></div>
    <div class="center">${audioButtons("p", id)}</div>
    <div class="center small">${esc(TONES[sylTone(id) - 1].name)} tone</div>
    ${ex.length ? `<div class="py-ex center">in ${ex.map(w => `<a href="#" class="chip" data-item="${esc(ik("w", w))}">${esc(w)}</a>`).join("")}</div>` : ""}
    <button class="btn primary full" data-gotit>Got it</button></main>`;
  bindPexit();
  play("p", id, null, true);
  $("[data-gotit]").onclick = () => {
    const S = store.S(), now = Date.now();
    (S.pintro ||= {})[id] = now; S.pdaily.newCount++;
    for (const f of ["tone", "sound"]) if (!S.cards[`p:${id}:${f}`]) S.cards[`p:${id}:${f}`] = newCard(now);
    markActive(); store.save();
    ["tone", "sound"].forEach((f, i) => psession.q.splice(Math.min(psession.q.length, 1 + i * 3), 0, { kind: "pcard", id: `p:${id}:${f}` }));
    nextPron();
  };
}
function pronCard(cid) {
  const [, id, facet] = cid.split(":");
  const options = facet === "tone" ? [1, 2, 3, 4].map(t => sylBase(id) + t) : soundOptions(id);
  view().innerHTML = `${pheader(facet === "tone" ? "Which tone?" : "Which syllable?")}<main class="card pcard">
    <button class="big-play" data-play="p|${id}|">🔊</button>
    <div class="muted center">${facet === "tone" ? `Listen: is it ${marked(sylBase(id))} with tone 1, 2, 3 or 4?` : "Listen and pick what you heard"}</div>
    <div class="p-opts ${facet}">${options.map(o => `<button class="p-opt ${facet === "tone" ? "t" + sylTone(o) : ""}" data-o="${o}">
      ${facet === "tone" ? `${toneSVG(TONES[sylTone(o) - 1].path, sylTone(o))}<span>${marked(o)}</span>` : marked(o)}</button>`).join("")}</div>
    <div class="p-feedback"></div></main>`;
  bindPexit();
  setTimeout(() => play("p", id), 200);
  view().querySelectorAll("[data-o]").forEach(b => b.onclick = () => {
    const right = b.dataset.o === id;
    view().querySelectorAll("[data-o]").forEach(x => { x.disabled = true; if (x.dataset.o === id) x.classList.add("right"); });
    if (!right) b.classList.add("wrong");
    const S = store.S();
    S.cards[cid] = review(S.cards[cid], right ? 3 : 1);
    S.log.push([Date.now(), cid, right ? 3 : 1]); markActive(); store.save();
    if (!right) psession.q.splice(Math.min(psession.q.length, 3), 0, { kind: "pcard", id: cid });
    $(".p-feedback").innerHTML = `<div class="${right ? "ok" : "bad"}">${right ? "✓ Correct" : `It was <b>${marked(id)}</b>`}</div>
      ${!right && facet === "sound" && hasP(b.dataset.o) ? `<button class="btn ghost small" data-play="p|${b.dataset.o}|">🔊 hear ${marked(b.dataset.o)}</button>` : ""}
      <button class="btn primary full" data-pnext>Next</button>`;
    if (right) play("p", id, null, true);
    $("[data-pnext]").onclick = () => { psession.done++; nextPron(); };
  });
}

/* ---------------- search by 字, pinyin or English ---------------- */
const stripTones = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Words and components matching a query, best first. Pinyin may be typed without tones ("nihao", "ni hao"). */
function searchItems(q, { sentencesOnly = false, limit = 12 } = {}) {
  q = q.trim();
  if (!q) return [];
  const ql = stripTones(q), qn = ql.replace(/\s+/g, ""), latin = /^[a-z\s'ü:-]+$/i.test(q);
  const wordRe = latin ? new RegExp(`\\b${reEsc(ql)}\\b`, "i") : null;
  const hits = [];
  D.order.forEach((o, pos) => {
    const isW = o.type === "word", id = o.id;
    if (sentencesOnly && (!isW || !D.sentences[id])) return;
    const w = words[id];
    const py = stripTones(isW ? w.py : (D.chars[id]?.py || []).join(" ")).replace(/\s+/g, "");
    const en = isW ? w.en : [D.chars[id]?.def || ""];
    let score = 0;
    if (!latin) score = id === q ? 100 : id.includes(q) ? 60 : 0;
    else {
      if (py === qn) score = 90;
      else if (wordRe.test(en[0] || "")) score = 80;
      else if (en.some(e => wordRe.test(e))) score = 70;
      else if (qn.length >= 2 && py.startsWith(qn)) score = 50;
      else if (ql.length >= 3 && en.some(e => e.toLowerCase().includes(ql))) score = 30;
      if (score && !isW) score -= 5;   // prefer whole words over components
    }
    if (score) hits.push({ id, type: isW ? "w" : "c", score, pos });
  });
  return hits.sort((a, b) => b.score - a.score || a.pos - b.pos).slice(0, limit);
}
/** Show matches under an input as you type; tapping one (or Enter) picks it. */
function attachSuggest(input, onPick, opts = {}) {
  const box = h(`<div class="suggest" hidden></div>`);
  input.after(box);
  let hits = [];
  const pick = hit => { input.value = hit.id; box.hidden = true; input.blur(); onPick(hit.id); };
  input.addEventListener("input", () => {
    hits = searchItems(input.value, opts);
    box.hidden = !hits.length;
    box.innerHTML = hits.map((x, i) => {
      const w = words[x.id], c = D.chars[x.id] || {};
      const py = x.type === "w" ? w.py : (c.py || [])[0] || "";
      const en = x.type === "w" ? w.en[0] : c.def || "component";
      return `<button class="sg" data-i="${i}"><span class="sg-hz">${esc(x.id)}</span><span class="sg-py">${esc(py)}</span><span class="sg-en">${esc(en)}</span></button>`;
    }).join("");
  });
  box.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) pick(hits[+b.dataset.i]); });
  input.addEventListener("keydown", e => { if (e.key === "Enter" && hits.length && /[a-z]/i.test(input.value)) { e.preventDefault(); pick(hits[0]); } });
}

function renderPad(kind = "char") {
  const tabs = `<div class="seg kind"><button data-kind="char" class="${kind === "char" ? "on" : ""}">字 Character</button><button data-kind="sent" class="${kind === "sent" ? "on" : ""}">句 Sentence</button></div>`;
  if (kind === "sent") return renderSentencePad(tabs);
  view().innerHTML = `${simpleHeader("Writing pad")}<main class="card">${tabs}
    <div class="seg"><button data-mode="free" class="on">Free</button><button data-mode="trace">Trace</button><button data-mode="memory">Memory</button><button data-mode="test">Test ✓</button></div>
    <input class="search" placeholder="Search 字, pinyin or English (e.g. drink)" data-target autocomplete="off">
    <div class="pad-area"></div></main>`;
  bindHome(view()); bindKind();
  let mode = "free";
  const area = $(".pad-area"), input = $("[data-target]");
  const go = () => {
    const t = [...input.value].filter(c => hasStrokes(c)).join("");
    if (mode === "test") {
      // a typed word/character is tested first; after that, random characters you've met
      const pool = testPool();
      const pick = () => { const p = pool.filter(c => c !== t); return p[Math.floor(Math.random() * p.length)] || pool[0]; };
      const next = target => testPad(area, target, { onNext: () => { input.value = ""; next(pick()); } });
      return next(t || pick());
    }
    if (mode === "free" || !t) { freePad(area); if (mode !== "free" && !input.value) area.insertAdjacentHTML("afterbegin", `<div class="muted small center">Type a character above to ${mode === "trace" ? "trace it" : "write it from memory"}.</div>`); return; }
    quizWord(area, t, { outline: mode === "trace" }).then(r => { toast(r.mistakes ? `${r.mistakes} mistakes` : "Perfect!"); go(); });
  };
  view().querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
    mode = b.dataset.mode; view().querySelectorAll("[data-mode]").forEach(x => x.classList.toggle("on", x === b)); go();
  });
  input.onchange = () => { if (!/[a-z]/i.test(input.value)) go(); };
  attachSuggest(input, () => { if (mode === "free") $("[data-mode=trace]").click(); else go(); });
  go();
}
function bindKind() { view().querySelectorAll("[data-kind]").forEach(b => b.onclick = () => renderPad(b.dataset.kind)); }

function renderSentencePad(tabs) {
  view().innerHTML = `${simpleHeader("Writing pad")}<main class="card">${tabs}
    <input class="search" placeholder="Find a word's sentence: 字, pinyin or English" data-sw autocomplete="off">
    <div class="muted small center sp-src"></div>
    <div class="sp-host"></div></main>`;
  bindHome(view()); bindKind();
  const host = $(".sp-host"), input = $("[data-sw]"), src = $(".sp-src");
  let wid = null, mode = "pinyin";
  const pool = sentencePool();
  src.textContent = introduced(ik("w", pool[0])) ? `Random sentences from your ${pool.length} learned words` : "Random sentences from the first words you'll study";
  const start = (w, m = mode) => { wid = w; mode = m; sentencePractice(host, wid, { mode, onNext: m2 => start(randomOther(), m2) }); };
  const randomOther = () => { const p = pool.filter(w => w !== wid); return p[Math.floor(Math.random() * p.length)] || wid; };
  input.onchange = () => {
    const q = input.value.trim();
    if (!q) return start(randomOther());
    if (/[a-z]/i.test(q)) return;   // English/pinyin goes through the suggestion list
    const hit = D.sentences[q] ? q : D.words.find(w => D.sentences[w.id] && (w.s === q || w.id.includes(q)))?.id;
    hit ? start(hit) : toast("No sentence for that word");
  };
  attachSuggest(input, id => start(id), { sentencesOnly: true });
  start(randomOther());
}

function renderBrowse() {
  view().innerHTML = `${simpleHeader("Browse")}<main class="list-wrap">
    <input class="search" placeholder="Search 字, pinyin or English" data-q>
    <div class="seg"><button data-f="all" class="on">All</button><button data-f="learned">Learned</button><button data-f="w">Words</button><button data-f="c">Components</button></div>
    <ul class="list"></ul></main>`;
  bindHome(view());
  let f = "all";
  const strip = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const draw = () => {
    const q = strip($("[data-q]").value.trim());
    const rows = [];
    for (const o of D.order) {
      const key = ik(o.type === "word" ? "w" : "c", o.id);
      if (f === "learned" && !introduced(key)) continue;
      if ((f === "w" || f === "c") && key[0] !== f) continue;
      const w = words[o.id];
      const py = key[0] === "w" ? w.py : (D.chars[o.id]?.py?.[0] || "");
      const en = meaningOf(key);
      if (q && !(o.id.includes(q) || strip(py).replace(/\s/g, "").includes(q.replace(/\s/g, "")) || en.toLowerCase().includes(q))) continue;
      rows.push(`<li><a href="#" data-item="${esc(key)}"><span class="dot ${introduced(key) ? "on" : ""}"></span>
        <span class="l-hz">${esc(o.id)}</span><span class="l-py">${esc(py)}</span><span class="l-en">${esc(en)}</span></a></li>`);
      if (rows.length > 400) break;
    }
    $(".list").innerHTML = rows.join("") || `<li class="muted center">Nothing matches.</li>`;
  };
  $("[data-q]").oninput = draw;
  view().querySelectorAll("[data-f]").forEach(b => b.onclick = () => { f = b.dataset.f; view().querySelectorAll("[data-f]").forEach(x => x.classList.toggle("on", x === b)); draw(); });
  draw();
}

function renderSettings() {
  const s = store.S().settings;
  view().innerHTML = `${simpleHeader("Settings")}<main class="card settings">
    <label>New items per day <input type="number" min="0" max="50" value="${s.newPerDay}" data-s="newPerDay"></label>
    <label>New sounds per day <input type="number" min="0" max="50" value="${s.pronNewPerDay ?? 10}" data-s="pronNewPerDay"></label>
    <label>Voice <select data-s="voice">
      <option value="alt" ${s.voice === "alt" ? "selected" : ""}>Alternate female / male</option>
      <option value="f" ${s.voice === "f" ? "selected" : ""}>Female (Xiaoxiao)</option>
      <option value="m" ${s.voice === "m" ? "selected" : ""}>Male (Yunxi)</option></select></label>
    <label class="check"><input type="checkbox" data-s="autoplay" ${s.autoplay ? "checked" : ""}> Play audio automatically</label>
    <label class="check"><input type="checkbox" data-s="showTrad" ${s.showTrad ? "checked" : ""}> Show traditional characters for reference</label>
    <label>Writing cards <select data-s="writeMode">
      <option value="strict" ${s.writeMode === "strict" ? "selected" : ""}>Check each stroke</option>
      <option value="free" ${s.writeMode === "free" ? "selected" : ""}>Free draw, grade myself</option></select></label>
    <hr>
    <div class="sync-box" data-sync></div>
    <hr>
    <label class="check"><input type="checkbox" data-s="mascot" ${s.mascot !== false ? "checked" : ""}> Show Bao the mascot (rude, 18+)</label>
    <button class="btn ghost" data-meetbao>Meet Bao: all his faces & moves</button>
    <div class="sync-box" data-remind></div>
    <hr>
    <button class="btn" data-offline>Download all audio for offline use</button>
    <div class="row"><button class="btn ghost" data-export>Export progress</button>
    <label class="btn ghost">Import progress<input type="file" accept="application/json" data-import hidden></label></div>
    <button class="btn danger ghost" data-reset>Reset all progress</button>
    <p class="muted small">Progress is saved on this device${sync.status().connected ? " and synced to your private GitHub Gist" : ""}. Export a backup now and then. Vocabulary: HSK 3.0 Level 1 (complete-hsk-vocabulary, CC-CEDICT). Characters & strokes: Make Me a Hanzi. Voices: Azure neural TTS.</p>
    ${launchTimesHTML()}
  </main>`;
  bindHome(view());
  view().querySelectorAll("[data-s]").forEach(inp => inp.onchange = () => {
    const k = inp.dataset.s;
    s[k] = inp.type === "checkbox" ? inp.checked : inp.type === "number" ? Math.max(0, +inp.value || 0) : inp.value;
    store.save(); toast("Saved");
  });
  $("[data-export]").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([store.exportJSON()], { type: "application/json" }));
    a.download = `hsk-tutor-backup-${store.today()}.json`; a.click();
  };
  $("[data-import]").onchange = async e => {
    try { store.importJSON(await e.target.files[0].text()); toast("Progress imported"); renderHome(); }
    catch (err) { toast(err.message); }
  };
  $("[data-reset]").onclick = () => {
    const msg = sync.status().connected
      ? "Erase progress on this device? Sync is on, so your cloud progress will download again. To start over everywhere, disconnect sync first and delete the gist on GitHub."
      : "Erase all progress on this device? This can't be undone.";
    if (confirm(msg)) { store.resetAll(); renderHome(); }
  };
  renderSyncBox();
  renderRemindBox();
  $("[data-meetbao]").onclick = renderBaoGallery;
  $("[data-offline]").onclick = async (e) => {
    const btn = e.target, urls = [];
    for (const [k, vs] of Object.entries(audioIndex)) for (const v of vs) urls.push(`audio/${v}/${k}.mp3`);
    const cache = await caches.open("hsk-audio");
    let n = 0;
    for (let i = 0; i < urls.length; i += 8) {
      await Promise.all(urls.slice(i, i + 8).map(u => cache.add(u).catch(() => {})));
      n = Math.min(urls.length, i + 8); btn.textContent = `Downloading audio… ${n}/${urls.length}`;
    }
    btn.textContent = "Audio saved for offline use ✓";
  };
}

/* ---------------- cloud sync (private GitHub Gist) ---------------- */
const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=gist&description=HSK%20Tutor%20sync";
function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
}
function renderSyncBox() {
  const box = $("[data-sync]"); if (!box) return;
  const st = sync.status();
  if (!st.connected) {
    box.innerHTML = `<div class="label">Sync across devices</div>
      <p class="muted small">Keeps your flashcards, streak and notes the same on every device, saved in a private gist on your GitHub account.
      <br>1. <a href="${TOKEN_URL}" target="_blank" rel="noopener">Create a GitHub token</a> with only the <b>gist</b> box ticked.
      <br>2. Paste it below. Do the same on each device (you can reuse the token).</p>
      <input class="search" type="password" autocomplete="off" placeholder="Paste GitHub token" data-token>
      <button class="btn primary" data-connect>Turn on sync</button>`;
    $("[data-connect]", box).onclick = async e => {
      const tok = $("[data-token]", box).value.trim();
      if (!tok) return toast("Paste your token first");
      e.target.disabled = true; e.target.textContent = "Connecting…";
      try { await sync.connect(tok); toast("Sync is on ✓"); renderSyncBox(); }
      catch (err) { toast(err.message); e.target.disabled = false; e.target.textContent = "Turn on sync"; }
    };
    return;
  }
  box.innerHTML = `<div class="label">Sync across devices</div>
    <div class="sync-status ${st.error ? "err" : ""}">${st.busy ? "☁️ Syncing…" : st.error ? `⚠️ ${esc(st.error)}` : st.lastSync ? `☁️ Synced ${ago(st.lastSync)}` : "☁️ On"}</div>
    <div class="row"><button class="btn ghost" data-syncnow>Sync now</button><button class="btn ghost danger" data-disconnect>Turn off</button></div>`;
  $("[data-syncnow]", box).onclick = () => sync.syncNow().then(() => toast("Synced ✓")).catch(err => toast(err.message));
  $("[data-disconnect]", box).onclick = () => {
    if (confirm("Turn off sync on this device? Your progress stays here and in the gist; this device just stops syncing.")) { sync.disconnect(); renderSyncBox(); }
  };
}
sync.onStatus(() => renderSyncBox());

/* ---------------- Bao's reminders (Web Push, sent by a scheduled GitHub job) ---------------- */
const VAPID_PUBLIC = "BMMNJFV5OZb_fk_acDIUTU50EFgD1wNMe8d6VoBrf99SWbovhz5Zjb12Eym9avsTd4wfHNPBwJK2bA8EaK_bepk";
const REMIND_HOURS = [8, 12, 17, 19, 21, 22];
const b64uBytes = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
function deviceId() {
  let id = localStorage.getItem("hsk-device");
  if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem("hsk-device", id); }
  return id;
}
const myReminder = () => { const r = store.S().pushSubs?.[deviceId()]; return r && !r.off ? r : null; };
async function enableReminders(hours) {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    throw new Error(standalone ? "This device can't receive web notifications (needs iOS 16.4 or later)."
      : "On iPhone, notifications only work from the Home Screen app: Share → Add to Home Screen, open it from there, then turn this on.");
  if (!sync.status().connected) throw new Error("Turn on sync first — Bao reads your progress from it to know when to nag you.");
  if (await Notification.requestPermission() !== "granted") throw new Error("Notifications are blocked. Allow them in Settings → Notifications → HSK Tutor.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(VAPID_PUBLIC) });
  const S = store.S();
  (S.pushSubs ||= {})[deviceId()] = { sub: sub.toJSON(), hours, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, at: Date.now() };
  store.save();
  await sync.syncNow();
}
async function disableReminders() {
  const S = store.S();
  (S.pushSubs ||= {})[deviceId()] = { off: true, at: Date.now() };
  store.save();
  try { const reg = await navigator.serviceWorker.ready; (await reg.pushManager.getSubscription())?.unsubscribe(); } catch {}
  sync.syncNow().catch(() => {});
}
function renderRemindBox() {
  const box = $("[data-remind]"); if (!box) return;
  const r = myReminder(), hours = r?.hours || store.S().settings.remindHours || [12, 19, 21];
  box.innerHTML = `<div class="label">Bao's reminders</div>
    <p class="muted small">${r ? `On for this device. Bao checks in at these times and only nags if you haven't studied that day.`
      : `Bao sends a push notification at the times you pick if you haven't studied that day — politely at first, then not. Needs sync on, and on iPhone the app must be opened from your Home Screen.`}</p>
    <div class="chips hour-chips">${REMIND_HOURS.map(hr => `<button class="chip ${hours.includes(hr) ? "on" : ""}" data-hr="${hr}">${hr}:00</button>`).join("")}</div>
    <div class="row">${r ? `<button class="btn ghost" data-rtest>Test notification</button><button class="btn ghost danger" data-roff>Turn off</button>`
      : `<button class="btn primary" data-ron>Turn on reminders</button>`}</div>`;
  box.querySelectorAll("[data-hr]").forEach(b => b.onclick = async () => {
    const hr = +b.dataset.hr, set = new Set(hours);
    set.has(hr) ? set.delete(hr) : set.add(hr);
    const list = [...set].sort((a, c) => a - c);
    store.S().settings.remindHours = list;
    if (r) { Object.assign(store.S().pushSubs[deviceId()], { hours: list, at: Date.now() }); }
    store.save(); renderRemindBox();
  });
  const on = $("[data-ron]", box);
  if (on) on.onclick = async () => {
    on.disabled = true; on.textContent = "Setting up…";
    try { await enableReminders(hours); toast("Bao is watching you now 👀"); }
    catch (e) { toast(e.message); }
    renderRemindBox();
  };
  const off = $("[data-roff]", box); if (off) off.onclick = async () => { await disableReminders(); toast("Reminders off. Bao is sulking."); renderRemindBox(); };
  const test = $("[data-rtest]", box);
  if (test) test.onclick = async () => {
    const st = mascotState(), pool = M.push[st.missed >= 7 ? "missed7" : st.missed >= 3 ? "missed3" : st.missed >= 1 ? "missed1" : "pending"];
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification("Bao 包子", { body: fillLine(pick(pool), st), icon: "icon-180.png", tag: "bao" });
  };
}
/** After a background sync brings in new progress, refresh the screen if it's safe (not mid-card). */
function refreshAfterSync() { if ($(".home", view())) renderHome(); }
function syncInBackground() { if (sync.status().connected) sync.syncNow().then(refreshAfterSync).catch(() => {}); }

/* ---------------- boot ---------------- */
const bootStatus = t => window.bootStatus?.(t);

// How long the last few launches took, shown under Settings → Launch times. The clock starts when iOS
// asks for the page, so time iOS spends before that (starting the app itself) isn't counted.
const LAUNCH_KEY = "hsk-launches";
function recordLaunch(ready) {
  setTimeout(() => {   // the first-paint entry lands a moment after the paint itself
    try {
      const n = performance.getEntriesByType("navigation")[0] || {};
      const fcp = performance.getEntriesByType("paint").find(p => p.name === "first-contentful-paint");
      const L = JSON.parse(localStorage.getItem(LAUNCH_KEY) || "[]");
      L.unshift({ at: Date.now(), page: n.responseEnd ? Math.round(n.responseEnd) : null, paint: fcp ? Math.round(fcp.startTime) : null,
        ready: Math.round(ready), cached: !!navigator.serviceWorker?.controller, reload: n.type === "reload" });
      localStorage.setItem(LAUNCH_KEY, JSON.stringify(L.slice(0, 6)));
    } catch {}
  }, 1500);
}
function launchTimesHTML() {
  let L = [];
  try { L = JSON.parse(localStorage.getItem(LAUNCH_KEY) || "[]"); } catch {}
  if (!L.length) return "";
  const s = ms => ms == null ? "?" : (ms / 1000).toFixed(2) + " s";
  const rows = L.map(r => `<li>${new Date(r.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}:
    page ${s(r.page)}, first picture ${s(r.paint)}, ready ${s(r.ready)}${r.cached ? "" : " (not from the phone's copy)"}${r.reload ? " (reload after update)" : ""}</li>`).join("");
  return `<details class="muted small"><summary>Launch times</summary><ul>${rows}</ul>
    <p>Counted from when iOS asks for the page. Time iOS spends before that isn't included.</p></details>`;
}
async function boot() {
  bootStatus("Fetching the word list…");
  // all three at once rather than one after another
  const [data, audio] = await Promise.all([
    fetch("data/hsk1.json").then(r => r.json()),
    fetch("audio/index.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
    loadMascot(),
  ]);
  D = data; audioIndex = audio;
  D.words.forEach(w => { words[w.id] = w; });
  D.order.forEach((o, i) => { if (o.type === "comp") comps.add(o.id); ORDER_POS[o.id] = i; });
  renderHome();
  window.bootDone?.();
  recordLaunch(performance.now());
  store.onSave(() => sync.schedule());
  syncInBackground();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncInBackground();
    else if (sync.pending()) sync.syncNow().catch(() => {});   // leaving the app: upload now instead of waiting
  });
  if (navigator.storage?.persist) navigator.storage.persist();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    // The app opens from the phone's copy; a newer version installs in the background. When it takes
    // over shortly after launch and nothing is under way yet, reload onto it so updates show up at once.
    const hadController = !!navigator.serviceWorker.controller, launched = Date.now();
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && Date.now() - launched < 20000 && $(".home", view()) && $("#sheet").hidden) location.reload();
    });
    navigator.serviceWorker.register("sw.js");
  }
}
boot().catch(e => { window.bootDone?.(); view().innerHTML = `<main class="card"><p>Couldn't load the app data.</p><pre>${esc(e.message)}</pre></main>`; });
