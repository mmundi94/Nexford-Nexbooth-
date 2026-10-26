"""Writes every Nexbooth asset as an .svg file and bundles them into js/assets.js."""
import json, os
from poses import POSES, pose_head
from props import PROPS

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
A = os.path.join(ROOT, "assets")
for sub in ("alpacas", "props"):
    os.makedirs(os.path.join(A, sub), exist_ok=True)

bundle = {"alpacas": [], "props": []}
for slug, name, fn in POSES:
    svg = fn().svg()
    open(os.path.join(A, "alpacas", slug + ".svg"), "w").write(svg)
    bundle["alpacas"].append({"id": slug, "name": name, "svg": svg})
for slug, name, fn in PROPS:
    svg = fn().svg()
    open(os.path.join(A, "props", slug + ".svg"), "w").write(svg)
    bundle["props"].append({"id": slug, "name": name, "svg": svg})

# favicon / logo: alpaca head
logo = pose_head().svg()
open(os.path.join(A, "nexbooth-logo.svg"), "w").write(logo)
bundle["logo"] = logo

# ---- crop every drawing tightly to its artwork (so selection boxes fit) ----
import re
from playwright.sync_api import sync_playwright

def crop_all(items):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        for it in items:
            svg = it["svg"]
            box = pg.evaluate("""(svg) => { document.body.innerHTML = svg; const el = document.querySelector('svg');
                const bb = el.getBBox(); const vb = el.viewBox.baseVal; return [bb.x, bb.y, bb.width, bb.height, vb.width, vb.height]; }""", svg)
            x, y, w, h, VW, VH = box
            m = 12
            x0, y0 = max(0, x - m), max(0, y - m)
            x1, y1 = min(VW, x + w + m), min(VH, y + h + m)
            W, H = round(x1 - x0), round(y1 - y0)
            it["svg"] = re.sub(r'^<svg ([^>]*?)width="[^"]+" height="[^"]+" viewBox="[^"]+"',
                               f'<svg \\1width="{W}" height="{H}" viewBox="{x0:.0f} {y0:.0f} {W} {H}"', svg, count=1)
        b.close()

crop_all(bundle["alpacas"] + bundle["props"])
for sub, items in (("alpacas", bundle["alpacas"]), ("props", bundle["props"])):
    for it in items:
        open(os.path.join(A, sub, it["id"] + ".svg"), "w").write(it["svg"])

with open(os.path.join(ROOT, "js", "assets.js"), "w") as fh:
    fh.write("/* Generated file: the Nexbooth alpaca and prop artwork (SVG). Edit the .svg files in assets/ for reference. */\n")
    fh.write("window.NEXBOOTH_ASSETS = " + json.dumps(bundle, separators=(",", ":")) + ";\n")
print("alpacas:", len(bundle["alpacas"]), "props:", len(bundle["props"]),
      "bundle KB:", os.path.getsize(os.path.join(ROOT, "js", "assets.js")) // 1024)
