"""Generate neural-voice MP3s for every HSK word and example sentence using Azure Speech.

Reads AZURE_SPEECH_KEY / AZURE_SPEECH_REGION from the project's .env file (never printed).
Safe to re-run: files that already exist are skipped, so it resumes after an interruption.

  .venv/bin/python tools/tts.py --test        # 3 words + 1 sentence per voice, to check it works
  .venv/bin/python tools/tts.py               # everything (free tier: ~20 requests/minute, so it paces itself)
  .venv/bin/python tools/tts.py --fast        # no pacing (for a paid S0 resource)
"""
import argparse, json, os, re, sys, time, urllib.request, urllib.error
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app")
VOICES = {"f": "zh-CN-XiaoxiaoNeural", "m": "zh-CN-YunxiNeural"}


def load_env():
    env = {}
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    key, region = env.get("AZURE_SPEECH_KEY", ""), env.get("AZURE_SPEECH_REGION", "")
    if not key or not region:
        sys.exit("Put AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env first.")
    return key, region


def key_for(kind, text):
    return f"{kind}_{text.encode('utf-8').hex()}"


def sapi(num):
    """'ni3 hao3' -> 'ni 3 hao 3' (Azure's SAPI pinyin phone set; ü is written v)."""
    num = num.lower().replace("u:", "v").replace("ü", "v")
    return " ".join(f"{m.group(1)} {m.group(2) or '5'}" for m in re.finditer(r"([a-zv]+)([1-5])?", num))


TONE_MARKS = {c: (base, t) for base, marks in {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}.items()
              for t, c in enumerate(marks, 1)}
# readings to use for components whose dictionary entry lists another reading first
CHAR_PY = {"宀": "mian2"}


def marked_to_num(py):
    """'jiōng' -> 'jiong1', 'men' -> 'men5'."""
    tone, out = 5, ""
    for ch in py.lower():
        if ch in TONE_MARKS:
            base, tone = TONE_MARKS[ch]
            out += base
        else:
            out += ch
    return out.replace("ü", "v") + str(tone)


def ssml(voice, text, num=None, rate="-10%"):
    body = escape(text)
    if num:  # pin the HSK reading so polyphones (了, 地, 还, 行...) are read correctly in isolation
        body = f'<phoneme alphabet="sapi" ph="{sapi(num)}">{body}</phoneme>'
    return (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">'
            f'<voice name="{voice}"><prosody rate="{rate}">{body}</prosody></voice></speak>')


def synth(key, region, doc):
    req = urllib.request.Request(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        data=doc.encode("utf-8"), method="POST",
        headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                 "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "hsk-tutor-tts"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                wait = int(e.headers.get("Retry-After") or 0) or 10 * (attempt + 1)
                print(f"  rate limited, waiting {wait}s"); time.sleep(wait); continue
            if e.code == 400:
                return None
            if e.code in (401, 403):
                sys.exit("Azure rejected the key (401/403). Check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.")
            raise
    raise RuntimeError("too many retries")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--fast", action="store_true")
    ap.add_argument("--chars", action="store_true", help="only single-character clips")
    ap.add_argument("--pinyin", action="store_true", help="only pinyin syllable clips (pronunciation section)")
    args = ap.parse_args()
    key, region = load_env()
    data = json.load(open(os.path.join(APP, "data", "hsk1.json"), encoding="utf-8"))

    # generate in learning order so the words you study first get audio first
    words = {w["id"]: w for w in data["words"]}
    jobs = []
    for o in data["order"]:
        if o["type"] != "word":
            continue
        w = words[o["id"]]
        jobs.append((key_for("w", w["s"]), w["s"], w["num"] if len(w["s"]) == 1 else None, "-10%"))
        s = data["sentences"].get(w["id"])
        if s:
            jobs.append((key_for("s", w["id"]), s["zh"], None, "-5%"))
    # single characters that aren't words themselves: components (冂, 亻...) and characters only seen inside words (们)
    single_words = {w["s"] for w in data["words"]}
    comp_order = [o["id"] for o in data["order"] if o["type"] != "word"]
    other = [c for c in data["chars"] if c not in single_words and c not in comp_order]
    for c in comp_order + other:
        py = data["chars"].get(c, {}).get("py") or []
        if c in single_words or not py:
            continue
        jobs.append((key_for("c", c), c, CHAR_PY.get(c) or marked_to_num(py[0]), "-10%"))
    if args.chars:
        jobs = [j for j in jobs if j[0].startswith("c_")]
    if args.pinyin:
        # pronunciation section: HSK 1 syllables in both voices first, then the rest of the chart (female voice)
        p = json.load(open(os.path.join(APP, "data", "pinyin.json"), encoding="utf-8"))
        first = set(p["hsk1"])
        jobs = [(key_for("p", s), p["sample"].get(s, "啊"), s, "-10%") for s in p["hsk1"]]
        jobs += [(key_for("p", s), ch, s, "-10%", ["f"]) for s, ch in p["sample"].items() if s not in first]
    if args.test:
        jobs = [j for j in jobs if j[1] in ("了", "还", "你好")] + [j for j in jobs if j[0].startswith("s_")][:1]

    index_path = os.path.join(APP, "audio", "index.json")
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}
    total = sum(len(j[4]) if len(j) > 4 else len(VOICES) for j in jobs)
    done = 0
    for d in VOICES:
        os.makedirs(os.path.join(APP, "audio", d), exist_ok=True)
    # both voices per item before moving on (or only the voices a job lists)
    for job in jobs:
        k, text, num, rate = job[:4]
        for vk, voice in VOICES.items():
            if len(job) > 4 and vk not in job[4]:
                continue
            done += 1
            out = os.path.join(APP, "audio", vk, k + ".mp3")
            if os.path.exists(out):
                index.setdefault(k, []).append(vk) if vk not in index.get(k, []) else None
                continue
            audio = synth(key, region, ssml(voice, text, num, rate))
            if audio is None and num:  # phoneme not accepted: fall back to plain text
                print(f"  phoneme rejected for {text}, using plain text")
                audio = synth(key, region, ssml(voice, text, None, rate))
            if not audio:
                print(f"  FAILED: {text}"); continue
            open(out, "wb").write(audio)
            if vk not in index.setdefault(k, []):
                index[k].append(vk)
            print(f"[{done}/{total}] {vk} {text}")
            json.dump(index, open(index_path, "w"))  # keep the app's list current while this runs
            if not args.fast:
                time.sleep(3.1)  # free tier allows ~20 requests per minute
    json.dump(index, open(index_path, "w"))
    print("done.", len(index), "clips indexed")


if __name__ == "__main__":
    main()
