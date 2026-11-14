"""Build app/data/charlevels.json: the characters each HSK level introduces, for the progress chart.

Level 1 is ordered by the app's learning order (so the chart fills in as you study);
later levels are ordered by word frequency. Each character is listed once, at the first
level that uses it. Later-level characters get pinyin, a short meaning and an example word.

  .venv/bin/python tools/build_charlevels.py
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
LABELS = {1: "HSK 1", 2: "HSK 2", 3: "HSK 3", 4: "HSK 4", 5: "HSK 5", 6: "HSK 6", 7: "HSK 7–9"}
HAN = re.compile(r"[㐀-鿿]")


def mmah():
    out = {}
    for line in open(os.path.join(RAW, "mmah", "dictionary.txt"), encoding="utf-8"):
        e = json.loads(line)
        out[e["character"]] = e
    return out


def short_def(d):
    d = re.sub(r"\(.*?\)", "", d or "").strip()
    return re.split(r"[;,]", d)[0].strip()[:40]


def main():
    dic = mmah()
    hsk1 = json.load(open(os.path.join(ROOT, "app", "data", "hsk1.json"), encoding="utf-8"))
    seen, levels, info = set(), [], {}

    # level 1 in learning order
    words1 = {w["id"]: w for w in hsk1["words"]}
    chars = []
    for o in hsk1["order"]:
        if o["type"] == "word":
            for c in words1[o["id"]]["s"]:
                if HAN.match(c) and c not in seen:
                    seen.add(c); chars.append(c)
    levels.append({"level": 1, "label": LABELS[1], "chars": "".join(chars)})

    for n in range(2, 8):
        words = json.load(open(os.path.join(RAW, "hsk", f"new{n}.json"), encoding="utf-8"))
        words.sort(key=lambda w: w.get("frequency") or 10**9)
        chars = []
        for w in words:
            for c in w["simplified"]:
                if HAN.match(c) and c not in seen:
                    seen.add(c); chars.append(c)
                    e = dic.get(c, {})
                    info[c] = [(e.get("pinyin") or [""])[0], short_def(e.get("definition")), w["simplified"]]
        levels.append({"level": n, "label": LABELS[n], "chars": "".join(chars)})

    out = os.path.join(ROOT, "app", "data", "charlevels.json")
    json.dump({"levels": levels, "info": info}, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    total = 0
    for l in levels:
        total += len(l["chars"])
        print(f'{l["label"]}: {len(l["chars"])} new characters (running total {total})')
    print("size", os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    main()
