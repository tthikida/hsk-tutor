// Bao's study reminders. Run hourly by .github/workflows/reminders.yml.
// Reads the progress gist (the same one the app syncs to), and for each device that turned reminders on:
// if it's one of that device's reminder hours (in its own time zone) and nothing was studied today,
// sends a push notification from app/data/mascot.json — ruder the longer it's been.
//
// env: GIST_ID, VAPID_PRIVATE_KEY (secrets), VAPID_PUBLIC_KEY, FORCE=1 to send now regardless of hour/study.
import webpush from "web-push";
import fs from "node:fs";

const { GIST_ID, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, FORCE } = process.env;
if (!GIST_ID) { console.log("GIST_ID not set yet: turn on sync in the app, then set the GIST_ID secret."); process.exit(0); }

const gh = await fetch(`${process.env.GIST_API || "https://api.github.com/gists"}/${GIST_ID}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "hsk-tutor-reminders" } });
if (!gh.ok) { console.log("could not read gist", gh.status); process.exit(1); }
const file = (await gh.json()).files["hsk-tutor-progress.json"];
const S = JSON.parse(file.truncated ? await (await fetch(file.raw_url)).text() : file.content);
const M = JSON.parse(fs.readFileSync(new URL("../app/data/mascot.json", import.meta.url)));

webpush.setVapidDetails("https://tthikida.github.io/hsk-tutor/", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const pad = n => String(n).padStart(2, "0");
/** Date parts in a time zone: {y, m, d, hour} */
function local(tz, t = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hour: +p.hour };
}
const key = ({ y, m, d }) => `${y}-${pad(m)}-${pad(d)}`;
const dayBefore = ({ y, m, d }, n) => { const t = new Date(Date.UTC(y, m - 1, d - n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };

const days = S.days || {};
const now = Date.now();
const due = Object.entries(S.cards || {}).filter(([, c]) => c.due <= now).length;
const pick = a => a[Math.floor(Math.random() * a.length)];

let sent = 0;
for (const [device, r] of Object.entries(S.pushSubs || {})) {
  if (!r || r.off || !r.sub) continue;
  const today = local(r.tz || "UTC");
  const isHour = (r.hours || []).includes(today.hour);
  const studied = !!days[key(today)];
  // streak counts today if studied, otherwise from yesterday
  let streak = 0; for (let i = studied ? 0 : 1; days[key(dayBefore(today, i))]; i++) streak++;
  // days missed since the last study day
  const keys = Object.keys(days).sort();
  let missed = 0;
  if (keys.length && !studied) { while (missed < 400 && !days[key(dayBefore(today, missed + 1))]) missed++; }
  const lastHour = Math.max(...(r.hours || [0]));

  let pool = null;
  if (FORCE) pool = studied ? "praise" : !keys.length ? "fresh" : missed >= 7 ? "missed7" : missed >= 3 ? "missed3" : missed >= 1 ? "missed1" : "pending";
  else if (!isHour) continue;
  else if (studied) pool = today.hour === lastHour && streak >= 3 && streak % 5 === 0 ? "praise" : null;
  else pool = !keys.length ? "fresh" : missed >= 7 ? "missed7" : missed >= 3 ? "missed3" : missed >= 1 ? "missed1" : "pending";
  if (!pool) continue;

  const body = pick(M.push[pool]).replace(/\{streak\}/g, streak).replace(/\{due\}/g, due).replace(/\{days\}/g, missed)
    .replace(/\{hour\}/g, `${today.hour}:00`);
  try {
    await webpush.sendNotification(r.sub, JSON.stringify({ title: "Bao 包子", body, badge: due }), { TTL: 3600 });
    sent++; console.log(`sent to ${device}: [${pool}] ${body}`);
  } catch (e) { console.log(`push to ${device} failed [${pool}] "${body}": ${e.statusCode || ""} ${e.body || e.message}`); }
}
console.log(`done, ${sent} sent`);
