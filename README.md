# HSK Tutor

Flashcard app for HSK 3.0 vocabulary (Level 1 for now), built as a web app that installs on an iPhone home screen.

## Layout
- `app/` — the web app (static files; serve this folder)
  - `js/srs.js` FSRS scheduling · `js/store.js` progress storage · `js/app.js` UI
  - `data/hsk1.json` words, character breakdowns, learning order, example sentences
  - `data/strokes/` stroke data for every character (hanzi-writer format)
  - `audio/f`, `audio/m` neural-voice MP3s (female Xiaoxiao, male Yunxi) + `audio/index.json`
- `tools/build_data.py` — rebuilds `app/data/` from `raw/` downloads + `tools/sentences.tsv`
- `tools/tts.py` — generates audio with Azure Speech (key in `.env`, never committed)
- `tools/sentences.tsv` — one example sentence per word (word, Chinese, English); edit and rebuild

## Commands
```bash
.venv/bin/python tools/build_data.py     # rebuild data after editing sentences or overrides
.venv/bin/python tools/tts.py            # generate any missing audio (resumable)
python3 -m http.server 8123 --directory app   # serve locally
python3 tools/bump_version.py            # before pushing app-code changes: new ?v= stamp so phones load matching files
```

## Sync
Settings → Sync across devices stores progress in one private GitHub Gist (`hsk-tutor-progress.json`).
Each device pastes a GitHub token with only the `gist` scope; the token stays in that device's browser.
`js/sync.js` pulls, merges (newest review per card wins; days, log and introductions are unioned), and pushes.

## Card types
Each word gets Read (字 → meaning), Write (meaning → draw 字), Listen (audio → meaning) and Tones cards,
scheduled independently and mixed together. Components (亻, 氵, 尔…) get Read and Write cards and are
introduced before the characters that use them. Tap any character for its breakdown; tap a part to jump to it.

## Credits
Word list: drkameleon/complete-hsk-vocabulary (MIT; definitions from CC-CEDICT, CC BY-SA).
Characters, decompositions and strokes: Make Me a Hanzi (Arphic Public License / LGPL), via hanzi-writer (MIT).
