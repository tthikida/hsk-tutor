// Bao the steamed bun: faces built from parts (eyes, brows, mouth, effects), body moves, and a small
// "brain" that blinks, looks at your finger, fidgets when bored and reacts to pokes.
// Everything is inline SVG + CSS animations (styles.css, "Bao the mascot").

const pick = a => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
const f1 = n => +n.toFixed(1);

/* ---------- shapes ---------- */
const star = (cx, cy, R, r) => {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r : R;
    d += (i ? "L" : "M") + f1(cx + k * Math.cos(a)) + " " + f1(cy + k * Math.sin(a));
  }
  return d + "z";
};
const heart = (cx, cy, s) => `M${cx} ${f1(cy + s * .9)}C${f1(cx - s * 1.6)} ${f1(cy - s * .1)} ${f1(cx - s * .8)} ${f1(cy - s * 1.3)} ${cx} ${f1(cy - s * .45)}` +
  `C${f1(cx + s * .8)} ${f1(cy - s * 1.3)} ${f1(cx + s * 1.6)} ${f1(cy - s * .1)} ${cx} ${f1(cy + s * .9)}z`;
const twinkle = (x, y, s) => `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}z`;
const ln = d => `<path d="${d}" class="ln"/>`;

/* ---------- eyes: one function per eye; x = centre, s = 1 for Bao's right (screen left), -1 for the other ---------- */
const dotEye = (x, y = 60, r = 4.5) => `<circle cx="${x}" cy="${y}" r="${r}" class="ink"/><circle cx="${f1(x + r * .35)}" cy="${f1(y - r * .38)}" r="${f1(r * .32)}" class="hl"/>`;
const EYE = {
  dot: x => dotEye(x),
  big: x => `<circle cx="${x}" cy="60" r="6.5" class="ink"/><circle cx="${x + 2.2}" cy="57.6" r="2.2" class="hl"/><circle cx="${x - 2}" cy="62.4" r="1" class="hl"/>`,
  wet: x => EYE.big(x) + `<path d="M${x - 5} 65q5 3 10 0" class="wet"/>`,
  tiny: x => `<circle cx="${x}" cy="60" r="2.2" class="ink"/>`,
  ring: x => `<circle cx="${x}" cy="60" r="6" class="white"/><circle cx="${x}" cy="60" r="2" class="ink"/>`,
  up: x => dotEye(x + 1.5, 56.5, 4),
  side: x => dotEye(x + 3, 60.5, 4),
  sad: x => dotEye(x, 61.5, 4),
  angry: x => dotEye(x, 62, 4),
  lid: x => `<circle cx="${x}" cy="62" r="4" class="ink"/>` + ln(`M${x - 7} 58h14`),
  half: x => `<path d="M${x - 5} 59a5 5 0 0 0 10 0z" class="ink"/>` + ln(`M${x - 6.5} 59h13`),
  sideHalf: x => `<path d="M${x - 2} 60a4.5 4.5 0 0 0 9 0z" class="ink"/>` + ln(`M${x - 6.5} 60h13`),
  glare: x => `<ellipse cx="${x}" cy="61" rx="5" ry="2.3" class="ink"/>`,
  happy: x => ln(`M${x - 6} 61q6-7 12 0`),
  joy: x => ln(`M${x - 6} 62q6-10 12 0`),
  closed: x => ln(`M${x - 6} 59q6 5 12 0`),
  flat: x => ln(`M${x - 6} 60h12`),
  squeeze: (x, s) => ln(`M${x - 5 * s} 56l${9 * s} 4l${-9 * s} 4`),
  x: x => ln(`M${x - 4} 56l8 8M${x + 4} 56l-8 8`),
  spiral: x => `<path d="M${x} 60m-1 0a1 1 0 1 1 2 0a2.2 2.2 0 1 1-4.4 0a3.6 3.6 0 1 1 7.2 0a5 5 0 1 1-10 0" class="ln thin fx-spin"/>`,
  heart: x => `<path d="${heart(x, 60, 4.6)}" class="love fx-beat"/>`,
  star: x => `<path d="${star(x, 60, 7, 3)}" class="gold fx-beat"/>`,
  tt: x => ln(`M${x - 5} 56h10M${x} 56v9`),
};
const OPEN_EYES = new Set(["dot", "big", "wet", "tiny", "ring", "up", "side", "sad", "angry", "lid", "half", "sideHalf", "glare"]);
function eyes(spec) {
  const [l, r = l] = spec.split("|");
  return EYE[l](44, 1) + EYE[r](76, -1);
}

/* ---------- brows ---------- */
const BROW = {
  angry: "M36 51l13 5M84 51l-13 5",
  worried: "M37 55l12-5M83 55l-12-5",
  raised: "M37 51q6-5 12 0M71 51q6-5 12 0",
  high: "M37 47q6-5 12 0M71 47q6-5 12 0",
  skeptic: "M37 48q6-5 12 0M70 54h13",
  flat: "M37 53h12M71 53h12",
};

/* ---------- mouths ---------- */
const MOUTH = {
  smile: ln("M51 73q9 8 18 0"),
  bigsmile: ln("M48 72q12 11 24 0"),
  grin: `<path d="M50 72q10 14 20 0z" class="mo"/>`,
  laugh: `<path d="M47 71q13 19 26 0z" class="mo"/><path d="M54 80q6-5 12 0q-6 4-12 0z" class="tg"/>`,
  small: ln("M55 74q5 4 10 0"),
  flat: ln("M53 76h14"),
  frown: ln("M51 79q9-9 18 0"),
  wail: `<path d="M49 83q11-17 22 0z" class="mo"/>`,
  wavy: ln("M48 76q3-3 6 0t6 0t6 0t6 0"),
  o: `<ellipse cx="60" cy="77" rx="4.5" ry="5.5" class="mo"/>`,
  tinyo: `<ellipse cx="60" cy="76" rx="2.4" ry="3" class="mo"/>`,
  scream: `<ellipse cx="60" cy="79" rx="6.5" ry="9" class="mo"/><ellipse cx="60" cy="85" rx="4" ry="2" class="tg"/>`,
  tongue: ln("M51 73q9 6 18 0") + `<path d="M57 75.5q0 8 4.5 8q4.5 0 4-8z" class="tg"/>`,
  cat: ln("M49 73q5.5 5 11 0q5.5 5 11 0"),
  smirk: ln("M52 76q9 2 16-5"),
  grit: `<rect x="49" y="71" width="22" height="8" rx="2" class="th"/>` + `<path d="M54.5 71v8M60 71v8M65.5 71v8M49 75h22" class="ln thin"/>`,
  yawn: `<ellipse cx="60" cy="79" rx="7" ry="10" class="mo"/><ellipse cx="60" cy="85" rx="4.5" ry="2.5" class="tg"/>`,
  whistle: `<ellipse cx="65" cy="76" rx="2.4" ry="2.8" class="mo"/>`,
  kiss: ln("M58 71q5 2.5 0 5q5 2.5 0 5"),
  chomp: `<ellipse cx="60" cy="76" rx="6" ry="4" class="mo fx-chomp"/>`,
  ugh: ln("M48 77l4-3l4 3l4-3l4 3l4-3l4 3"),
  drool: ln("M51 73q9 8 18 0") + `<path d="M66 76.5q2.5 6 0 9q-2.5-3 0-9z" class="drop fx-drip"/>`,
  evil: `<path d="M45 70q15 17 30 0z" class="mo"/><path d="M47.5 71.5q12.5 5 25 0l-1 2.4q-11.5 4.4-23 0z" class="th"/>`,
  pout: ln("M55 78q5-4 10 0"),
  sigh: `<ellipse cx="57" cy="77" rx="3" ry="2" class="mo"/>`,
};

/* ---------- effects (front layer unless marked back) ---------- */
const STEAM = { 1: [[60, 10]], 2: [[52, 14], [68, 14]], 3: [[46, 14], [60, 10], [74, 14]] };
const steam = n => `<g class="fx-steam">${STEAM[n].map(([x, y]) => `<path d="M${x} ${y}q-5-6 0-12"/>`).join("")}</g>`;
const FX = {
  steam1: steam(1), steam2: steam(2), steam3: steam(3),
  sweat: `<path d="M92 40q4 8 0 10q-4-2 0-10z" class="drop fx-drip"/>`,
  sweat2: `<path d="M92 40q4 8 0 10q-4-2 0-10z" class="drop fx-drip"/><path d="M24 44q3 6 0 8q-3-2 0-8z" class="drop fx-drip d2"/>`,
  vein: `<path d="M86 30l6 6M92 30l-6 6M89 27v12M83 33h12" class="vein fx-throb"/>`,
  tear: `<path d="M40 66q3 6 0 8q-3-2 0-8z" class="drop fx-fall"/>`,
  tearjoy: `<path d="M36 62q3 5 0 7q-3-2 0-7z" class="drop fx-fall"/><path d="M84 62q3 5 0 7q-3-2 0-7z" class="drop fx-fall d2"/>`,
  streams: `<path d="M42 64q-2 10 0 24M78 64q2 10 0 24" class="stream"/>`,
  hearts: `<g class="fx-rise">${[[96, 30, 4], [106, 16, 3], [88, 12, 2.5]].map(([x, y, s]) => `<path d="${heart(x, y, s)}" class="love"/>`).join("")}</g>`,
  sparkles: `<g class="fx-twinkle">${[[12, 30, 4], [106, 26, 5], [114, 56, 3.5], [4, 54, 3]].map(([x, y, s]) => `<path d="${twinkle(x, y, s)}" class="gold"/>`).join("")}</g>`,
  zzz: `<g class="fx-rise txt-muted">${[[92, 28, 9, "z"], [100, 16, 12, "Z"], [109, 3, 15, "Z"]].map(([x, y, s, t]) => `<text x="${x}" y="${y}" font-size="${s}">${t}</text>`).join("")}</g>`,
  question: `<text x="96" y="34" font-size="30" class="txt-accent fx-wobble">?</text>`,
  exclaim: `<text x="98" y="36" font-size="36" class="txt-accent fx-popin">!</text>`,
  exclaim2: `<text x="92" y="36" font-size="34" class="txt-accent fx-popin">!!</text>`,
  notes: `<g class="fx-rise txt-accent">${[[96, 26, 14, "♪"], [106, 12, 16, "♫"], [86, 8, 11, "♪"]].map(([x, y, s, t]) => `<text x="${x}" y="${y}" font-size="${s}">${t}</text>`).join("")}</g>`,
  blush: `<path d="M28 71l3-4M33 72l3-4M38 72l3-4M79 72l3-4M84 72l3-4M89 71l3-4" class="pinkln"/>`,
  puffs: `<g class="fx-puff">${[[4, 60], [116, 60]].map(([x, y]) => `<g><circle cx="${x}" cy="${y}" r="4"/><circle cx="${x + (x < 60 ? -4 : 4)}" cy="${y - 4}" r="3"/><circle cx="${x + (x < 60 ? -6 : 6)}" cy="${y + 2}" r="2.5"/></g>`).join("")}</g>`,
  smoke: `<g class="fx-smoke">${[[50, 12], [62, 6], [72, 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5"/>`).join("")}</g>`,
  orbit: `<g transform="translate(60 14) scale(1 .38)"><g class="fx-orbit">${[[24, 0], [-12, 21], [-12, -21]].map(([x, y]) => `<path d="${star(x, y, 6, 2.6)}" class="gold"/>`).join("")}</g></g>`,
  bubble: `<circle cx="72" cy="73" r="5" class="snot fx-bubble"/>`,
  bulb: `<g class="fx-glow"><path d="M100 2a8 8 0 0 1 5 14.2v3.3h-10v-3.3a8 8 0 0 1 5-14.2z" class="bulb"/><path d="M96 22h8M97 25h6" class="ln thin"/>` +
    `<path d="M100-10v4M88-5l3 3M112-5l-3 3M85 7h4M115 7h-4" class="ray"/></g>`,
  shades: `<path d="M32 55h23v3q0 9-11.5 9t-11.5-9zM65 55h23v3q0 9-11.5 9t-11.5-9z" class="shade"/><path d="M55 57q5-3 10 0" class="ln thin"/>` +
    `<path d="M36 58.5l6-2.5M69 58.5l6-2.5" class="glint"/>`,
  dots: `<g class="fx-dots">${[92, 100, 108].map(x => `<circle cx="${x}" cy="22" r="2.4"/>`).join("")}</g>`,
  cloud: `<g class="fx-cloudy"><path d="M40 2a8 8 0 0 1 14-6a10 10 0 0 1 18 2a7 7 0 0 1 6 12h-36a7 7 0 0 1-2-8z" class="cloud"/>` +
    `<g class="fx-rain">${[48, 58, 68].map((x, i) => `<path d="M${x} 13v5" class="raindrop d${i}"/>`).join("")}</g></g>`,
  confetti: `<g class="fx-confetti">${[[10, "#e0574f"], [26, "#ffb340"], [44, "#5cc97a"], [62, "#6f9cff"], [80, "#e0574f"], [96, "#ffb340"], [110, "#a970ff"], [18, "#6f9cff"], [70, "#5cc97a"], [104, "#ff7ab8"]]
    .map(([x, c], i) => `<rect x="${x}" y="${-6 - (i % 3) * 6}" width="4" height="6" rx="1" fill="${c}" class="d${i % 5}"/>`).join("")}</g>`,
  fire: `<g class="fx-fire">${[[16, 70, 10], [104, 70, 10], [30, 36, 8], [90, 36, 8], [60, 16, 9]].map(([x, y, s]) =>
    `<path d="M${x} ${y}q${-s} ${-s * .6} 0 ${-s * 2.2}q${s} ${s * 1.6} 0 ${s * 2.2}z" class="flame"/>`).join("")}</g>`,
  halo: `<ellipse cx="60" cy="8" rx="18" ry="4.5" class="halo fx-hover"/>`,
  crumbs: `<g class="fx-crumbs">${[[54, 82], [64, 84], [59, 86]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.4" class="d${i}"/>`).join("")}</g>`,
  sighpuff: `<g class="fx-sigh"><circle cx="46" cy="80" r="3.5"/><circle cx="40" cy="78" r="2.5"/></g>`,
  spray: `<g class="fx-spray">${[[44, 84], [52, 88], [60, 90], [68, 88], [76, 84]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5"/>`).join("")}</g>`,
};
const BACK_FX = new Set(["fire", "puffs"]);

/* ---------- the faces ---------- */
// e: eyes ("left|right" for odd pairs), b: brows, m: mouth, fx: effects, t: body tint, blush: rosier cheeks, idle: resting motion
export const FACES = {
  neutral:     { e: "dot", m: "small" },
  happy:       { e: "happy", m: "smile", fx: ["steam2"] },
  ecstatic:    { e: "joy", m: "grin", fx: ["steam3", "sparkles"] },
  annoyed:     { e: "lid", m: "flat", fx: ["sweat"] },
  furious:     { e: "angry", b: "angry", m: "frown", fx: ["vein", "smoke"], t: "red", idle: "tremble" },
  laughing:    { e: "squeeze", m: "laugh", fx: ["tearjoy"] },
  love:        { e: "heart", m: "grin", fx: ["hearts"], blush: 1 },
  starstruck:  { e: "star", m: "grin", fx: ["sparkles"] },
  proud:       { e: "happy", b: "raised", m: "cat", fx: ["sparkles"] },
  smug:        { e: "half", b: "raised", m: "smirk" },
  cool:        { e: "dot", m: "smirk", fx: ["shades"] },
  wink:        { e: "dot|happy", m: "smile", fx: ["sparkles"] },
  cheeky:      { e: "happy|dot", m: "tongue" },
  silly:       { e: "big|tiny", m: "tongue" },
  surprised:   { e: "big", b: "high", m: "o", fx: ["exclaim"] },
  shocked:     { e: "ring", b: "high", m: "scream", fx: ["exclaim2", "sweat"], t: "pale" },
  confused:    { e: "dot|tiny", b: "skeptic", m: "wavy", fx: ["question"] },
  thinking:    { e: "up", b: "skeptic", m: "pout", fx: ["dots"] },
  idea:        { e: "big", b: "raised", m: "grin", fx: ["bulb"] },
  curious:     { e: "big", b: "raised", m: "tinyo" },
  sleepy:      { e: "half", m: "small", fx: ["zzz"], idle: "snooze" },
  asleep:      { e: "closed", m: "tinyo", fx: ["zzz", "bubble"], idle: "snooze" },
  yawning:     { e: "closed", b: "worried", m: "yawn" },
  bored:       { e: "half", b: "flat", m: "flat" },
  skeptical:   { e: "dot", b: "skeptic", m: "flat" },
  suspicious:  { e: "sideHalf", b: "flat", m: "flat" },
  nervous:     { e: "dot", b: "worried", m: "wavy", fx: ["sweat2"] },
  embarrassed: { e: "squeeze", m: "wavy", fx: ["blush", "sweat"], blush: 1 },
  shy:         { e: "happy", b: "worried", m: "small", fx: ["blush"], blush: 1 },
  sad:         { e: "sad", b: "worried", m: "frown", fx: ["tear"] },
  crying:      { e: "tt", b: "worried", m: "wail", fx: ["streams"] },
  pleading:    { e: "wet", b: "worried", m: "pout" },
  sulking:     { e: "sideHalf", b: "worried", m: "pout", fx: ["cloud"] },
  grumpy:      { e: "half", b: "angry", m: "frown" },
  disgusted:   { e: "squeeze", b: "angry", m: "ugh", t: "green" },
  dizzy:       { e: "spiral", m: "wavy", fx: ["orbit"] },
  ko:          { e: "x", m: "tongue", fx: ["orbit"] },
  dazed:       { e: "ring", m: "o", fx: ["orbit"] },
  hungry:      { e: "big", b: "raised", m: "drool" },
  munching:    { e: "happy", m: "chomp", fx: ["crumbs"] },
  whistling:   { e: "side", b: "raised", m: "whistle", fx: ["notes"] },
  innocent:    { e: "happy", m: "small", fx: ["halo"] },
  singing:     { e: "closed", b: "raised", m: "o", fx: ["notes"] },
  kissy:       { e: "closed", m: "kiss", fx: ["hearts"], blush: 1 },
  determined:  { e: "angry", b: "angry", m: "grit", fx: ["fire"] },
  scared:      { e: "tiny", b: "worried", m: "grit", fx: ["sweat2"], t: "pale" },
  evil:        { e: "glare", b: "angry", m: "evil", t: "dark" },
  mischievous: { e: "sideHalf", b: "angry", m: "cat" },
  celebrate:   { e: "joy", m: "laugh", fx: ["confetti", "sparkles"] },
  relieved:    { e: "closed", m: "smile", fx: ["sighpuff"] },
  squished:    { e: "squeeze", m: "wavy", blush: 1 },
  sneezy:      { e: "squeeze", b: "worried", m: "tinyo" },
  achoo:       { e: "squeeze", b: "high", m: "scream", fx: ["spray"] },
  fuming:      { e: "glare", b: "angry", m: "grit", fx: ["puffs", "steam3"], t: "red" },
  peaceful:    { e: "closed", m: "smile", fx: ["steam1"] },
};
// what each face does when shown on its own (gallery, reactions)
export const FACE_MOVE = {
  neutral: "bounce", happy: "hop", ecstatic: "flip", annoyed: "no", furious: "stomp", laughing: "giggle", love: "pulse", starstruck: "spin",
  proud: "stretch", smug: "tilt", cool: "sway", wink: "boing", cheeky: "wiggle", silly: "jelly", surprised: "jump", shocked: "jump",
  confused: "tilt", thinking: "tilt", idea: "hop", curious: "lean", sleepy: "nod", asleep: "snooze", yawning: "stretch", bored: "deflate",
  skeptical: "tilt", suspicious: "lean", nervous: "shiver", embarrassed: "squish", shy: "sway", sad: "melt", crying: "shiver",
  pleading: "pulse", sulking: "sulk", grumpy: "no", disgusted: "no", dizzy: "dizzy", ko: "faint", dazed: "dizzy", hungry: "wiggle",
  munching: "nom", whistling: "sway", innocent: "float", singing: "sway", kissy: "lean", determined: "stomp", scared: "shiver",
  evil: "tremble", mischievous: "tilt", celebrate: "hop2", relieved: "deflate", squished: "jelly", sneezy: "sneeze", achoo: "sneeze",
  fuming: "puff", peaceful: "float",
};
// body moves and how long each takes (ms); the keyframes live in styles.css as b-<name>
export const MOVES = {
  bounce: 500, hop: 650, hop2: 1100, boing: 700, jelly: 800, spin: 800, flip: 900, backflip: 900, roll: 1000, shake: 500, shiver: 700,
  tremble: 600, nod: 800, no: 800, tilt: 1600, sway: 1800, wiggle: 700, dance: 1600, float: 2000, pulse: 900, faint: 2200, deflate: 1600,
  puff: 1400, lean: 1400, peek: 700, dizzy: 1300, sneeze: 1000, stretch: 1300, squish: 200, giggle: 900, sulk: 1800, zoom: 1200,
  stomp: 900, snooze: 3000, nom: 1200, jump: 800, melt: 1800,
};

/** SVG markup for Bao wearing face `name`. */
export function svg(name = "neutral", cls = "") {
  const p = parts(name);
  return `<svg class="bao ${p.cls} ${cls}" viewBox="0 0 120 100" aria-hidden="true">
    <ellipse cx="60" cy="95" rx="38" ry="4.5" class="bao-shadow"/>
    <g class="bao-fxb">${p.back}</g>
    <g class="bao-idle"><g class="bao-rig">
      <path d="M14 82q-6-30 22-48q12-12 24-14q12 2 24 14q28 18 22 48q-2 10-46 10t-46-10z" class="bao-body"/>
      <path d="M60 20q-4 10-14 14M60 20q4 10 14 14M60 20v12M60 20q-12 4-22 12M60 20q12 4 22 12" class="bao-pleat"/>
      <ellipse cx="34" cy="70" rx="6" ry="3.5" class="bao-cheek"/><ellipse cx="86" cy="70" rx="6" ry="3.5" class="bao-cheek"/>
      <g class="bao-face">${p.face}</g>
      <g class="bao-fx">${p.front}</g>
    </g></g></svg>`;
}
function parts(name) {
  const F = FACES[name] || FACES.neutral, fx = F.fx || [];
  return {
    face: `<g class="bao-eyes">${eyes(F.e)}</g>` + (F.b ? `<path d="${BROW[F.b]}" class="ln brow"/>` : "") + MOUTH[F.m],
    front: fx.filter(k => !BACK_FX.has(k)).map(k => FX[k]).join(""),
    back: fx.filter(k => BACK_FX.has(k)).map(k => FX[k]).join(""),
    cls: [F.t ? `t-${F.t}` : "", F.blush ? "bl" : "", F.idle ? `i-${F.idle}` : ""].filter(Boolean).join(" "),
    blink: F.e.split("|").every(e => OPEN_EYES.has(e)),
  };
}

/** Swap the face on an existing Bao svg in place. */
export function setFace(el, name) {
  const p = parts(name);
  el.querySelector(".bao-face").innerHTML = p.face;
  el.querySelector(".bao-fx").innerHTML = p.front;
  el.querySelector(".bao-fxb").innerHTML = p.back;
  el.classList.remove(...[...el.classList].filter(c => /^(t-|i-|bl$)/.test(c)));
  if (p.cls) el.classList.add(...p.cls.split(" "));
  el.dataset.face = name;
  el.dataset.blink = p.blink ? "1" : "";
}
/** Play a body move; returns how long it takes. */
export function move(el, name) {
  const ms = MOVES[name] || 600;
  el.classList.remove(...[...el.classList].filter(c => c.startsWith("a-")));
  void el.getBoundingClientRect();          // restart the animation even if it's the same move
  el.style.setProperty("--d", ms + "ms");
  el.classList.add("a-" + name);
  clearTimeout(el._mv);
  if (name !== "squish") el._mv = setTimeout(() => el.classList.remove("a-" + name), ms);
  return ms;
}

/* ---------- moods: what Bao does by himself, and when poked ---------- */
export const BASE = { neutral: "neutral", happy: "happy", ecstatic: "ecstatic", annoyed: "annoyed", furious: "furious", sleepy: "sleepy", session: "celebrate" };
const FIDGET = {
  happy: [["wink", "boing"], ["whistling", "sway"], ["singing", "sway"], ["love", "pulse"], ["laughing", "giggle"], ["proud", "stretch"],
    ["happy", "dance"], ["starstruck", "spin"], ["munching", "nom"], ["look"], ["yawning", "stretch"], ["cool", "sway"], ["innocent", "float"],
    ["peaceful", "float"], ["sneeze"], ["silly", "jelly"], ["ecstatic", "backflip"]],
  neutral: [["look"], ["yawning", "stretch"], ["whistling", "sway"], ["thinking", "tilt"], ["idea", "hop"], ["bored", "deflate"], ["sneeze"],
    ["curious", "lean"], ["wink", "boing"], ["hungry", "wiggle"], ["munching", "nom"], ["singing", "sway"], ["innocent", "float"], ["look"],
    ["suspicious", "lean"], ["peaceful", "float"], ["roll"]],
  annoyed: [["look"], ["sulking", "sulk"], ["skeptical", "tilt"], ["bored", "deflate"], ["grumpy", "no"], ["suspicious", "lean"],
    ["yawning", "stretch"], ["sad", "melt"], ["pleading", "pulse"], ["relieved", "deflate"], ["nervous", "shiver"]],
  furious: [["evil", "tremble"], ["determined", "stomp"], ["grumpy", "shake"], ["fuming", "puff"], ["suspicious", "lean"], ["disgusted", "no"],
    ["mischievous", "tilt"]],
  sleepy: [["asleep", "snooze"], ["yawning", "stretch"], ["sleepy", "nod"], ["asleep", "snooze"], ["dazed", "dizzy"]],
};
FIDGET.ecstatic = FIDGET.happy; FIDGET.session = FIDGET.happy;
const TAP = {
  happy: [["laughing", "giggle"], ["wink", "boing"], ["love", "pulse"], ["cheeky", "wiggle"], ["surprised", "jump"], ["starstruck", "spin"],
    ["proud", "stretch"], ["ecstatic", "flip"], ["kissy", "lean"], ["celebrate", "hop2"], ["cool", "sway"], ["silly", "jelly"], ["shy", "sway"],
    ["embarrassed", "squish"], ["happy", "dance"], ["ecstatic", "backflip"], ["laughing", "roll"], ["idea", "zoom"]],
  neutral: [["surprised", "jump"], ["confused", "tilt"], ["curious", "lean"], ["laughing", "giggle"], ["wink", "boing"], ["silly", "jelly"],
    ["cheeky", "wiggle"], ["shy", "sway"], ["idea", "hop"], ["embarrassed", "squish"], ["happy", "hop"], ["skeptical", "tilt"], ["innocent", "float"]],
  annoyed: [["grumpy", "no"], ["skeptical", "tilt"], ["sulking", "sulk"], ["annoyed", "shake"], ["disgusted", "no"], ["suspicious", "lean"],
    ["bored", "deflate"]],
  furious: [["furious", "stomp"], ["evil", "tremble"], ["determined", "stomp"], ["fuming", "puff"], ["furious", "shake"]],
};
TAP.ecstatic = TAP.happy; TAP.session = TAP.happy; TAP.sleepy = TAP.neutral;
const POKE = [["dizzy", "dizzy"], ["confused", "tilt"], ["nervous", "shiver"], ["shocked", "jump"], ["squished", "jelly"], ["dazed", "dizzy"], ["scared", "shiver"]];
const POKE_MAD = [["annoyed", "shake"], ["grumpy", "no"], ["furious", "stomp"], ["disgusted", "no"], ["ko", "faint"], ["evil", "tremble"], ["fuming", "puff"]];

/* ---------- the brain ---------- */
const live = new Set();
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

class Bao {
  constructor(sec, line) {
    this.sec = sec; this.el = sec.querySelector("svg.bao"); this.line = line;
    this.mood = sec.dataset.mood || "neutral"; this.base = sec.dataset.base || BASE[this.mood] || "neutral";
    this.busyUntil = 0; this.taps = 0; this.lastTap = 0; this.last = null; this.timers = new Set();
    setFace(this.el, this.base);
    live.add(this);
    this.bind();
    if (sec.dataset.enter) move(this.el, sec.dataset.enter);
    this.later(() => this.fidgetLoop(), rnd(4000, 8000));
    this.later(() => this.blinkLoop(), rnd(1500, 3500));
  }
  alive() { if (this.sec.isConnected) return true; this.stop(); return false; }
  stop() { this.timers.forEach(clearTimeout); this.timers.clear(); live.delete(this); }
  later(fn, ms) {
    const t = setTimeout(() => { this.timers.delete(t); if (this.alive()) fn(); }, ms);
    this.timers.add(t); return t;
  }
  moodKey() { return this.mood === "sleepy" && Date.now() < (this.awake || 0) ? "neutral" : this.mood; }
  /** Show a face + move for a while, then settle back to the resting face. */
  act(face, mv, linger = 0) {
    clearTimeout(this.back);
    if (face) setFace(this.el, face);
    const ms = mv ? move(this.el, mv) : 0;
    const hold = Math.max(ms + 300, 1800) + linger;
    this.busyUntil = Date.now() + hold;
    this.back = this.later(() => setFace(this.el, this.restFace()), hold);
  }
  restFace() { return this.mood === "sleepy" && Date.now() < (this.awake || 0) ? "neutral" : this.base; }
  look(x, y) { const f = this.el.querySelector(".bao-face"); f.style.setProperty("--lx", x + "px"); f.style.setProperty("--ly", y + "px"); }
  say(pool) {
    const span = this.sec.querySelector(".bubble span"), b = this.sec.querySelector(".bubble");
    const text = this.line?.(this.sec, pool);
    if (!span || !text) return;
    span.textContent = text;
    b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
  }
  blinkLoop() {
    if (this.el.dataset.blink && !document.hidden) {
      const eyesEl = this.el.querySelector(".bao-eyes");
      eyesEl.classList.add("blink");
      setTimeout(() => eyesEl.classList.remove("blink"), 130);
      if (Math.random() < .2) setTimeout(() => { eyesEl.classList.add("blink"); setTimeout(() => eyesEl.classList.remove("blink"), 130); }, 280);
    }
    this.later(() => this.blinkLoop(), rnd(2200, 5500));
  }
  fidgetLoop() {
    if (!document.hidden && Date.now() > this.busyUntil && Date.now() - lastPointer > 1500) this.fidget();
    this.later(() => this.fidgetLoop(), rnd(6000, 12000));
  }
  fidget() {
    const opts = FIDGET[this.moodKey()] || FIDGET.neutral;
    let f; do f = pick(opts); while (opts.length > 1 && f === this.last);
    this.last = f;
    const [face, mv] = f;
    if (face === "look") return this.lookAround();
    if (face === "sneeze") return this.sneeze();
    if (!face && mv) return move(this.el, mv);
    this.act(face, mv, rnd(400, 1600));
  }
  lookAround() {
    this.busyUntil = Date.now() + 2400;
    const seq = [[-3.5, 0], [-3.5, 0], [3.5, -1], [3.5, -1], [0, -2.5], [0, 0]];
    seq.forEach(([x, y], i) => this.later(() => this.look(x, y), i * 380));
  }
  sneeze() {
    clearTimeout(this.back);
    setFace(this.el, "sneezy"); move(this.el, "sneeze");
    this.busyUntil = Date.now() + 2400;
    this.later(() => setFace(this.el, "achoo"), 560);
    this.back = this.later(() => setFace(this.el, "relieved"), 1300);
    this.later(() => setFace(this.el, this.restFace()), 2400);
  }
  bind() {
    const s = this.sec;
    s.addEventListener("pointerdown", e => {
      this.downAt = Date.now();
      clearTimeout(this.lp);
      this.lp = this.later(() => {                // long press: squish him
        this.squishing = true; clearTimeout(this.back);
        setFace(this.el, "squished"); move(this.el, "squish"); this.say("squish");
        this.busyUntil = Date.now() + 99999;
      }, 420);
    });
    const up = e => {
      clearTimeout(this.lp);
      if (!this.downAt) return;
      this.downAt = 0;
      if (this.squishing) { this.squishing = false; this.el.classList.remove("a-squish"); this.act("surprised", "boing"); return; }
      if (e.type === "pointerup") this.tap();
    };
    s.addEventListener("pointerup", up);
    s.addEventListener("pointercancel", up);
    s.addEventListener("pointerleave", up);
    s.addEventListener("contextmenu", e => e.preventDefault());
  }
  tap() {
    const now = Date.now();
    this.taps = now - this.lastTap < 2500 ? this.taps + 1 : 1;
    this.lastTap = now;
    if (this.mood === "sleepy" && now > (this.awake || 0)) {   // woke him up
      this.awake = now + 45000;
      this.act("shocked", "jump", 400); this.say("wake");
      return;
    }
    let pool, linePool;
    if (this.taps >= 7) { pool = POKE_MAD; linePool = "pokeMad"; }
    else if (this.taps >= 4) { pool = POKE; linePool = "poke"; }
    else pool = TAP[this.moodKey()] || TAP.neutral;
    let r; do r = pick(pool); while (pool.length > 1 && r === this.lastTapR);
    this.lastTapR = r;
    this.act(r[0], r[1], 600);
    this.say(linePool);
  }
}

// eyes follow your finger / cursor
let lastPointer = 0, raf = 0, px = 0, py = 0, settle;
function onPointer(e) {
  px = e.clientX; py = e.clientY; lastPointer = Date.now();
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    for (const b of live) {
      if (!b.alive()) continue;
      const r = b.el.getBoundingClientRect();
      const dx = (px - (r.left + r.width / 2)) / Math.max(120, Math.abs(px - (r.left + r.width / 2))) ;
      const dy = (py - (r.top + r.height * .6)) / Math.max(120, Math.abs(py - (r.top + r.height * .6)));
      b.look(f1(dx * 3.5), f1(dy * 2.5));
    }
  });
  clearTimeout(settle);
  settle = setTimeout(() => live.forEach(b => b.alive() && b.look(0, 0)), 2500);
}

let watching = false;
/** Bring every `.mascot` section on the page to life. line(section, pool) supplies speech. */
export function watch(line) {
  if (watching) return; watching = true;
  const scan = () => document.querySelectorAll(".mascot:not([data-live])").forEach(sec => { sec.dataset.live = "1"; new Bao(sec, line); });
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
  addEventListener("pointermove", onPointer, { passive: true });
  addEventListener("pointerdown", onPointer, { passive: true });
}

/** A little Bao that pops in at the top corner to react (to a grade, a test score…), then leaves. */
export function pop(face, text, mv = FACE_MOVE[face]) {
  document.querySelector(".bao-pop")?.remove();
  const el = document.createElement("div");
  el.className = "bao-pop"; el.setAttribute("aria-hidden", "true");
  el.innerHTML = (text ? `<div class="pop-say">${String(text).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</div>` : "") + svg(face);
  document.body.append(el);
  const s = el.querySelector("svg");
  if (!reduced()) setTimeout(() => s.isConnected && move(s, mv || "bounce"), 260);
  setTimeout(() => el.classList.add("out"), 1900);
  setTimeout(() => el.remove(), 2300);
}
