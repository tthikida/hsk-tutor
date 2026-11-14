"""Build app/data/hsk1.json from the raw downloads.

Sources (downloaded into raw/):
  raw/hsk/new1.json          HSK 3.0 level 1 list (drkameleon/complete-hsk-vocabulary, MIT; meanings from CC-CEDICT)
  raw/mmah/dictionary.txt    Make Me a Hanzi character dictionary (decomposition, etymology)
  raw/hwd/package/*.json     hanzi-writer-data stroke data (Make Me a Hanzi, Arphic Public License)

Run:  python3 -I tools/build_data.py
"""
import json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
OUT = os.path.join(ROOT, "app", "data")
LEVEL = 1

# Preferred reading for words whose dictionary entry lists several.
PINYIN_OVERRIDE = {
    "吧": "ba", "差": "chà", "地": "dì", "的": "de", "好": "hǎo", "了": "le", "着": "zhe",
    "地方": "dì fang", "东西": "dōng xi", "告诉": "gào su", "多少": "duō shao",
    "出来": "chū lai", "起来": "qǐ lai", "女人": "nǚ rén", "哪": "nǎ", "还": "hái",
    "给": "gěi", "会": "huì", "看": "kàn", "说": "shuō", "行": "xíng", "要": "yào",
    "中": "zhōng", "重": "zhòng", "子": "zǐ", "分": "fēn", "干": "gàn", "间": "jiān",
    "见": "jiàn", "教": "jiāo", "累": "lèi", "少": "shǎo", "难": "nán", "都": "dōu",
    "读": "dú", "大": "dà", "打": "dǎ", "车": "chē", "弟": "dì", "和": "hé",
    "好吃": "hǎo chī", "号": "hào", "喝": "hē", "几": "jǐ", "家": "jiā", "没": "méi",
    "跑": "pǎo", "女": "nǚ", "那": "nà", "年": "nián", "呢": "ne", "上": "shàng",
    "听": "tīng", "页": "yè", "雨": "yǔ", "远": "yuǎn", "正": "zhèng", "别": "bié",
    "比": "bǐ", "过": "guò", "后": "hòu", "回": "huí", "里": "lǐ", "吗": "ma",
    "元": "yuán", "大学": "dà xué", "日": "rì", "西": "xī", "书": "shū", "考": "kǎo",
}
# Short, learner-friendly meanings where the dictionary's first senses are misleading.
MEANING_OVERRIDE = {
    "后": ["after; later", "behind; back"],
    "里": ["inside; in", "(measure) li, half a kilometer"],
    "考": ["to take a test", "to test; to examine"],
    "回": ["to return; to go back", "(measure word for times/occurrences)"],
    "干": ["to do; to work"],
    "地": ["ground; floor", "earth; land"],
    "差": ["poor; bad; not up to standard", "to lack; short of"],
    "子": ["child; son", "(noun suffix, toneless in many words)"],
    "会": ["can; know how to", "will; be likely to", "meeting"],
    "行": ["OK; all right", "to walk; to go"],
    "好": ["good; well; fine", "very; quite"],
    "出来": ["to come out", "(after a verb) out; completion"],
    "起来": ["to get up; to stand up", "(after a verb) start to; up"],
    "那": ["that; those", "then; in that case"],
    "哪": ["which?"],
}
JUNK = re.compile(r"^(surname|old variant|variant of|archaic variant|unofficial variant|euphemistic variant|used in|abbr\.)", re.I)
IDS_OPS = set("⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻")


def norm(p):
    return p.lower().replace(" ", "")


def pick_form(word):
    forms = [f for f in word["forms"] if not all(JUNK.match(m) for m in f["meanings"])]
    forms = forms or word["forms"]
    want = PINYIN_OVERRIDE.get(word["simplified"])
    if want:
        exact = [f for f in forms if f["transcriptions"]["pinyin"].replace(" ", "") == want.replace(" ", "")]
        match = exact or [f for f in forms if norm(f["transcriptions"]["pinyin"]) == norm(want)]
        if match:
            forms = match
    else:
        lower = [f for f in forms if f["transcriptions"]["pinyin"][:1].islower()]
        forms = lower or forms
    # among equal candidates, keep the richest entry
    f = max(forms, key=lambda f: len([m for m in f["meanings"] if not JUNK.match(m)]))
    meanings = [m for m in f["meanings"] if not JUNK.match(m)][:3] or f["meanings"][:2]
    return f, MEANING_OVERRIDE.get(word["simplified"], meanings)


def main():
    hsk = json.load(open(os.path.join(RAW, "hsk", f"new{LEVEL}.json")))
    mmah = {}
    for line in open(os.path.join(RAW, "mmah", "dictionary.txt"), encoding="utf-8"):
        j = json.loads(line)
        mmah[j["character"]] = j
    hwd = os.path.join(RAW, "hwd", "package")

    def stroke_count(c):
        p = os.path.join(hwd, c + ".json")
        return len(json.load(open(p))["strokes"]) if os.path.exists(p) else 0

    words = []
    for w in hsk:
        f, meanings = pick_form(w)
        words.append({
            "id": w["simplified"],
            "s": w["simplified"],
            "t": f.get("traditional", w["simplified"]),
            "py": f["transcriptions"]["pinyin"],
            "num": f["transcriptions"]["numeric"],
            "en": meanings,
            "pos": w.get("pos", []),
            "freq": w.get("frequency", 99999),
        })
    single = {w["s"]: w for w in words if len(w["s"]) == 1}

    def components(c):
        e = mmah.get(c)
        if not e:
            return []
        out = []
        for ch in e.get("decomposition", ""):
            if ch in IDS_OPS or ch in "？?" or ch == c:
                continue
            if ch not in out:
                out.append(ch)
        return out

    def meaningful(c):
        e = mmah.get(c)
        return bool(e and e.get("definition")) and (c in single or stroke_count(c) > 1)

    # ---- learning order: building blocks first ----
    order, placed, chars = [], set(), {}

    def note_char(c):
        if c in chars:
            return
        e = mmah.get(c, {})
        chars[c] = {
            "def": e.get("definition", ""),
            "py": e.get("pinyin", []),
            "parts": [p for p in components(c) if meaningful(p)],
            "allParts": components(c),
            "hint": (e.get("etymology") or {}).get("hint", ""),
            "etym": (e.get("etymology") or {}).get("type", ""),
            "phonetic": (e.get("etymology") or {}).get("phonetic", ""),
            "semantic": (e.get("etymology") or {}).get("semantic", ""),
            "radical": e.get("radical", ""),
            "strokes": stroke_count(c),
        }

    def place_char_deps(c, stack):
        note_char(c)
        for p in chars[c]["parts"]:
            if p in stack:
                continue
            if p in single:
                place_word(single[p], stack | {p})
            else:
                place_comp(p, stack | {p})

    def place_comp(c, stack):
        key = ("comp", c)
        if key in placed:
            return
        place_char_deps(c, stack)
        placed.add(key)
        order.append({"type": "comp", "id": c})

    def place_word(w, stack=frozenset()):
        key = ("word", w["id"])
        if key in placed:
            return
        for c in w["s"]:
            place_char_deps(c, stack | {c})
        placed.add(key)
        order.append({"type": "word", "id": w["id"]})

    for w in sorted(words, key=lambda w: w["freq"]):
        place_word(w)

    # "used in": which words/components contain each character
    used_in = {}
    for w in words:
        for c in set(w["s"]):
            used_in.setdefault(c, {"words": [], "chars": []})["words"].append(w["id"])
    for c, info in chars.items():
        for p in info["parts"]:
            used_in.setdefault(p, {"words": [], "chars": []})["chars"].append(c)
    for c in chars:
        chars[c]["usedIn"] = used_in.get(c, {"words": [], "chars": []})

    sentences, oov = build_sentences(words)
    comps = [o["id"] for o in order if o["type"] == "comp"]
    data = {"level": LEVEL, "words": words, "chars": chars, "order": order, "sentences": sentences}
    os.makedirs(OUT, exist_ok=True)
    json.dump(data, open(os.path.join(OUT, f"hsk{LEVEL}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    # copy stroke data for every character the app can show
    sdir = os.path.join(OUT, "strokes")
    os.makedirs(sdir, exist_ok=True)
    copied = 0
    for c in chars:
        src = os.path.join(hwd, c + ".json")
        if os.path.exists(src):
            shutil.copyfile(src, os.path.join(sdir, c + ".json"))
            copied += 1
    print(f"words={len(words)} chars={len(chars)} component cards={len(comps)} strokes copied={copied}")
    print("first 40 in order:", " ".join(o["id"] + ("*" if o["type"] == "comp" else "") for o in order[:40]))
    print("components:", " ".join(comps))
    print(f"sentences={len(sentences)}; words outside HSK 1 used in sentences:", " ".join(sorted(oov)) or "none")


PUNCT = set("，。？！：“”、；（）,.?!: ")


def build_sentences(words):
    """Tokenize each example sentence into HSK words (longest match) so the app can link every word."""
    path = os.path.join(ROOT, "tools", "sentences.tsv")
    if not os.path.exists(path):
        return {}, set()
    try:
        from pypinyin import lazy_pinyin, Style
    except ImportError:
        sys.exit("pip install pypinyin  (needed for sentence pinyin)")
    vocab = {w["s"]: w for w in words}
    # common combinations that aren't separate HSK entries (tokenized, not given their own card)
    extra = {"一下": "yí xià"}
    for k, py in extra.items():
        vocab.setdefault(k, {"s": k, "py": py, "extra": True})
    maxlen = max(len(k) for k in vocab)
    out, oov = {}, set()
    for line in open(path, encoding="utf-8"):
        parts = line.rstrip("\n").split("\t")
        if len(parts) != 3:
            continue
        wid, zh, en = parts
        toks, i = [], 0
        while i < len(zh):
            ch = zh[i]
            if ch in PUNCT:
                toks.append({"w": ch, "p": 1})
                i += 1
                continue
            for n in range(min(maxlen, len(zh) - i), 0, -1):
                seg = zh[i:i + n]
                if seg in vocab:
                    t = {"w": seg, "py": vocab[seg]["py"].lower() if n > 1 else None}
                    if not vocab[seg].get("extra"):
                        t["id"] = seg
                    toks.append(t)
                    i += n
                    break
            else:
                toks.append({"w": ch})
                oov.add(ch)
                i += 1
        # sentence pinyin: pypinyin handles tone in context; HSK readings fill in single-char words
        for t in toks:
            if t.get("p"):
                continue
            if not t.get("py"):
                t["py"] = " ".join(lazy_pinyin(t["w"], style=Style.TONE))
        out[wid] = {"zh": zh, "en": en, "toks": toks}
    return out, oov


if __name__ == "__main__":
    main()
