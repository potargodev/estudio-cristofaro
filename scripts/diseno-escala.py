"""Codemod: lleva los tamaños de texto sueltos a la escala única de DESIGN.md.

  python3 scripts/diseno-escala.py [--dry]

text-[Npx] (N <= 24) y text-xs/sm/base/lg/xl/2xl pasan a los tokens
text-micro/caption/meta/ui/body/lead/title/section/headline. Los tamaños de
display (26 px o más) se quedan: son títulos de página y de landings.
"""
import re, sys, pathlib

PX = {10: "micro", 11: "micro", 12: "caption", 13: "meta", 14: "ui", 15: "body", 16: "lead", 17: "title", 18: "title", 19: "section", 20: "section", 21: "section", 22: "headline", 23: "headline", 24: "headline"}
TW = {"xs": "caption", "sm": "ui", "base": "lead", "lg": "title", "xl": "section", "2xl": "headline"}
re_px = re.compile(r"(?<![\w\[-])((?:[a-z0-9-]+:)*)text-\[(\d+(?:\.\d+)?)px\](?![\w-])")
re_tw = re.compile(r"(?<![\w\[-])((?:[a-z0-9-]+:)*)text-(xs|sm|base|lg|xl|2xl)(?![\w-])")

def px(m):
    n = float(m.group(2))
    k = PX.get(round(n)) if n == round(n) else None
    return f"{m.group(1)}text-{k}" if k else m.group(0)

dry = "--dry" in sys.argv
changed = 0
for f in [*pathlib.Path("src").rglob("*.tsx"), *pathlib.Path("src").rglob("*.ts")]:
    s = f.read_text()
    t = re_tw.sub(lambda m: f"{m.group(1)}text-{TW[m.group(2)]}", re_px.sub(px, s))
    if t != s:
        changed += 1
        if not dry:
            f.write_text(t)
print(f"{changed} archivos")
