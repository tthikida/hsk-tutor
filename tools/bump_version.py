"""Stamp a new version on the app's code files so phones never mix old and new modules.

Updates ?v=N on the stylesheet, app.js and every module import, plus the service worker's
cache version. Run before every deploy that changes app code:

  python3 tools/bump_version.py          # next version
"""
import os, re

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")


def edit(path, fn):
    p = os.path.join(APP, path)
    s = open(p, encoding="utf-8").read()
    open(p, "w", encoding="utf-8").write(fn(s))


sw = open(os.path.join(APP, "sw.js"), encoding="utf-8").read()
n = int(re.search(r'const VERSION = "v(\d+)"', sw).group(1)) + 1
q = f"?v={n}"

edit("sw.js", lambda s: re.sub(r'const VERSION = "v\d+"', f'const VERSION = "v{n}"', s))
edit("sw.js", lambda s: re.sub(r'"(styles\.css|js/\w+\.js)(\?v=\d+)?"', lambda m: f'"{m.group(1)}{q}"', s))
edit("index.html", lambda s: re.sub(r'(href="styles\.css|src="js/app\.js)(\?v=\d+)?"', lambda m: f'{m.group(1)}{q}"', s))
for f in os.listdir(os.path.join(APP, "js")):
    if f.endswith(".js"):
        edit(f"js/{f}", lambda s: re.sub(r'from "\./(\w+)\.js(\?v=\d+)?"', lambda m: f'from "./{m.group(1)}.js{q}"', s))
print("version", n)
