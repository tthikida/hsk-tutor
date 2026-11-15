"""Build app/data/pinyin.json: every Mandarin syllable laid out as an initials x finals chart,
plus the syllables used in HSK 1 (for pronunciation flashcards) with example words.

Syllable ids use numeric pinyin with v for ü, e.g. "lv3", "zhong1".

  .venv/bin/python tools/build_pinyin.py
"""
import json, os, re
from pypinyin.pinyin_dict import pinyin_dict
from pypinyin.contrib.tone_convert import to_tone3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INITIALS = ["b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "zh", "ch", "sh", "r", "z", "c", "s"]
FINALS = ["a", "o", "e", "i", "u", "v", "ai", "ei", "ao", "ou", "an", "en", "ang", "eng", "ong", "er",
          "ia", "ie", "iao", "iu", "ian", "in", "iang", "ing", "iong",
          "ua", "uo", "uai", "ui", "uan", "un", "uang", "ueng", "ve", "van", "vn"]
ZERO = {"yi": "i", "ya": "ia", "ye": "ie", "yao": "iao", "you": "iu", "yan": "ian", "yin": "in", "yang": "iang",
        "ying": "ing", "yong": "iong", "wu": "u", "wa": "ua", "wo": "uo", "wai": "uai", "wei": "ui", "wan": "uan",
        "wen": "un", "wang": "uang", "weng": "ueng", "yu": "v", "yue": "ve", "yuan": "van", "yun": "vn"}


def parse(syl):
    """'zhong' -> ('zh', 'ong'); 'ju' -> ('j', 'v'); 'yuan' -> ('', 'van'). None if not a standard syllable."""
    if syl in ZERO:
        return "", ZERO[syl]
    if syl in FINALS:
        return "", syl
    for ini in sorted(INITIALS, key=len, reverse=True):
        if syl.startswith(ini):
            fin = syl[len(ini):]
            if ini in ("j", "q", "x") and fin.startswith("u"):
                fin = "v" + fin[1:]          # ju = jü, juan = jüan
            return (ini, fin) if fin in FINALS else None
    return None


def main():
    # every standard syllable that some character is read as
    sylls, sample = set(), {}
    for cp, readings in pinyin_dict.items():
        for r in readings.split(","):
            t3 = to_tone3(r.strip(), v_to_u=False, neutral_tone_with_five=True)
            m = re.fullmatch(r"([a-zv]+)([1-5])", t3)
            if not m or not parse(m.group(1)):
                continue
            sylls.add(m.group(1))
            sample.setdefault(t3, chr(cp))

    hsk1 = json.load(open(os.path.join(ROOT, "app", "data", "hsk1.json"), encoding="utf-8"))
    words = {w["id"]: w for w in hsk1["words"]}
    order, examples = [], {}
    for o in hsk1["order"]:
        if o["type"] != "word":
            continue
        w = words[o["id"]]
        syl_nums = [s.lower().replace("u:", "v").replace("ü", "v") for s in w["num"].split()]
        for i, s in enumerate(syl_nums):
            m = re.fullmatch(r"([a-zv]+)([1-5])", s)
            if not m or m.group(2) == "5" or not parse(m.group(1)):
                continue
            if s not in examples:
                order.append(s); examples[s] = []
            if len(examples[s]) < 4:
                examples[s].append(w["s"])
            # use a real HSK character as the text Azure reads (the phoneme tag sets the sound)
            sample[s] = w["s"][i] if i < len(w["s"]) else sample.get(s, "啊")

    table = {}
    for s in sorted(sylls):
        ini, fin = parse(s)
        table.setdefault(fin, {})[ini] = s
    out = {"initials": [""] + INITIALS, "finals": [f for f in FINALS if f in table], "table": table,
           "hsk1": order, "examples": examples, "sample": {k: v for k, v in sample.items()
                                                           if re.fullmatch(r"[a-zv]+[1-4]", k) and k[:-1] in sylls}}
    json.dump(out, open(os.path.join(ROOT, "app", "data", "pinyin.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(sylls)} syllables, {len(order)} HSK1 syllable+tone items, {len(out['finals'])} final rows")


if __name__ == "__main__":
    main()
