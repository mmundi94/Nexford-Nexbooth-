"""Christmas prop stickers, v2 (flat sticker style to match the alpaca)."""
import math
from kit import *
from alpaca import santa_hat, antlers, glasses, gift, mug, heart


def star_path(cx, cy, R, r, n=5, rot=-90):
    pts = []
    for i in range(n * 2):
        rad = R if i % 2 == 0 else r
        a = math.radians(rot + i * 180 / n)
        pts.append(f"{'M' if i == 0 else 'L'}{f(cx + rad*math.cos(a))},{f(cy + rad*math.sin(a))}")
    return " ".join(pts) + " Z"


def holly(x, y, k=1.0):
    leaf = "M0,0 C10,-8 18,-6 26,-14 C26,-6 34,-2 36,4 C28,6 24,14 16,12 C14,6 6,6 0,0Z"
    s = f'<g transform="translate({f(x)} {f(y)}) scale({k})">'
    for rot in (-160, -20):
        s += f'<path d="{leaf}" transform="rotate({rot})" fill="{GREEN}"/>'
        s += f'<path d="M2,0 L30,-2" transform="rotate({rot})" stroke="{GREEN_S}" stroke-width="2" stroke-linecap="round"/>'
    for (bx, by) in ((-7, -4), (6, -6), (0, 6)):
        s += f'<circle cx="{bx}" cy="{by}" r="8" fill="{RED}"/><circle cx="{bx-2.6}" cy="{by-2.6}" r="2.3" fill="#fff" opacity="0.7"/>'
    return s + "</g>"


def prop_hat():
    d = Doc(300, 220)
    d.add(f'<g transform="translate(130 206) scale(1.35)">{santa_hat(d)}</g>'); return d


def prop_antlers():
    d = Doc(300, 200)
    d.add(f'<g transform="translate(150 196) scale(1.2)">{antlers()}</g>')
    d.add(f'<path d="M34,190 C64,124 236,124 266,190" fill="none" stroke="#7A4A2A" stroke-width="9" stroke-linecap="round"/>')
    d.add(holly(150, 140, 1.0)); return d


def prop_nose():
    d = Doc(120, 120)
    d.add(f'<circle cx="60" cy="60" r="44" fill="{RED}"/><circle cx="66" cy="66" r="38" fill="{RED_S}" opacity="0.35"/>'
          f'<ellipse cx="46" cy="44" rx="12" ry="8" fill="#fff" opacity="0.7" transform="rotate(-30 46 44)"/>'); return d


def prop_glasses():
    d = Doc(260, 100, border=4)
    g = glasses(color="#2E2420").replace('r="15"', 'r="19"').replace('fill-opacity="0.18"', 'fill-opacity="0"')
    d.add(f'<g transform="translate(130 44) scale(1.85)">{g}</g>'); return d


def prop_star_glasses():
    d = Doc(300, 130)
    s = ""
    for cx in (90, 210):
        s += f'<path d="{star_path(cx, 66, 56, 27)}" fill="{GOLD}" stroke="{GOLD}" stroke-width="6" stroke-linejoin="round"/>'
        s += f'<path d="{star_path(cx, 68, 34, 16)}" fill="#3D2E58" opacity="0.85" stroke="#3D2E58" stroke-width="3" stroke-linejoin="round"/>'
        s += f'<ellipse cx="{cx-8}" cy="58" rx="6" ry="3.5" fill="#fff" opacity="0.6"/>'
    s += f'<path d="M136,62 Q150,50 164,62" fill="none" stroke="{GOLD_S}" stroke-width="7" stroke-linecap="round"/>'
    d.add(s); return d


def prop_gift(box, box_s, ribbon, ribbon_s):
    def fn():
        d = Doc(220, 220)
        d.add(gift(d, 110, 118, size=150, box=box, box_s=box_s, ribbon=ribbon, ribbon_s=ribbon_s)); return d
    return fn


def prop_mug():
    d = Doc(220, 250)
    d.add(mug(d, 96, 160, size=112)); return d


def prop_candy():
    d = Doc(140, 280)
    path = "M90,250 L90,80 C90,30 30,30 30,80"
    s = f'<path d="{path}" fill="none" stroke="#FFFFFF" stroke-width="32" stroke-linecap="round"/>'
    s += f'<path d="{path}" fill="none" stroke="{RED}" stroke-width="32" stroke-dasharray="14 16"/>'
    s += f'<path d="M98,250 L98,80" fill="none" stroke="#000" stroke-width="10" opacity="0.08"/>'
    s += f'<path d="M80,240 L80,84 C80,50 52,42 42,62" fill="none" stroke="#fff" stroke-width="5" opacity="0.55" stroke-linecap="round"/>'
    d.add(s); return d


def prop_ornament(color, shade):
    def fn():
        d = Doc(180, 210)
        s = f'<path d="M90,40 C72,12 108,12 90,40" fill="none" stroke="{GOLD_S}" stroke-width="5"/>'
        s += f'<rect x="73" y="36" width="34" height="20" rx="4" fill="{GOLD}"/>'
        s += blob(d, [("c", 90, 128, 72)], color, shade, dx=-8, dy=-10,
                  extra=f'<path d="M18,120 Q90,146 162,120" fill="none" stroke="{WHITE}" stroke-width="9" opacity="0.9"/>'
                        + sparkle(54, 156, 8, "#FFFFFF") + sparkle(90, 166, 9, "#FFFFFF") + sparkle(126, 156, 8, "#FFFFFF")
                        + f'<ellipse cx="60" cy="90" rx="17" ry="10" fill="#fff" opacity="0.5" transform="rotate(-35 60 90)"/>')
        d.add(s); return d
    return fn


def prop_tree():
    d = Doc(220, 280)
    s = f'<rect x="96" y="226" width="28" height="36" rx="4" fill="{BROWN}"/>'
    for (top, half, bot) in reversed([(30, 58, 112), (70, 78, 172), (118, 96, 236)]):
        p = ("p", f"M110,{top} Q118,{top+6} {110+half},{bot} Q110,{bot+10} {110-half},{bot} Q102,{top+6} 110,{top} Z",
             (110 - half, top, 110 + half, bot + 10))
        s += blob(d, [p], GREEN, GREEN_S, dx=-6, dy=-4)
    for (x, y, c) in [(92, 96, RED), (134, 140, GOLD), (72, 152, "#4CC9F0"), (122, 200, RED), (62, 214, GOLD), (160, 214, "#B983FF")]:
        s += f'<circle cx="{x}" cy="{y}" r="8.5" fill="{c}"/><circle cx="{x-2.5}" cy="{y-2.5}" r="2.4" fill="#fff" opacity="0.6"/>'
    s += f'<path d="{star_path(110, 30, 26, 12)}" fill="{GOLD}" stroke="{GOLD}" stroke-width="4" stroke-linejoin="round"/>'
    d.add(s); return d


def prop_mistletoe():
    d = Doc(200, 210)
    s = f'<path d="M100,0 L100,68" stroke="{RED}" stroke-width="5"/>'
    leaf = "M0,0 C20,-14 50,-10 70,0 C50,10 20,14 0,0Z"
    for rot, k in ((120, 1.0), (60, 1.0), (150, 0.85), (30, 0.85), (95, 0.9)):
        s += f'<path d="{leaf}" transform="translate(100 76) rotate({rot}) scale({k})" fill="{GREEN}"/>'
        s += f'<path d="M4,0 L62,0" transform="translate(100 76) rotate({rot}) scale({k})" stroke="{GREEN_S}" stroke-width="2.5"/>'
    s += f'<path d="M100,70 C72,50 62,80 100,76 C138,80 128,50 100,70Z" fill="{RED}"/>'
    for (x, y) in ((92, 94), (108, 96), (100, 108)):
        s += f'<circle cx="{x}" cy="{y}" r="8.5" fill="#FFFDF2"/><circle cx="{x+2}" cy="{y+2}" r="6" fill="{SNOW_S}" opacity="0.6"/>'
    d.add(s); return d


def prop_snowman():
    d = Doc(200, 260)
    s = blob(d, [("c", 100, 192, 60)], WHITE, SNOW_S, dx=-6, dy=-8)
    s += blob(d, [("c", 100, 100, 44)], WHITE, SNOW_S, dx=-5, dy=-7)
    s += f'<rect x="70" y="18" width="60" height="42" rx="5" fill="#2E2A2A"/><rect x="56" y="56" width="88" height="11" rx="5" fill="#2E2A2A"/>'
    s += f'<rect x="70" y="44" width="60" height="9" fill="{RED}"/>'
    s += f'<circle cx="85" cy="94" r="5.5" fill="{EYE}"/><circle cx="115" cy="94" r="5.5" fill="{EYE}"/>'
    s += f'<path d="M100,104 L130,111 L100,114Z" fill="#F08A24"/>'
    s += f'<path d="M88,124 Q100,131 112,124" fill="none" stroke="{EYE}" stroke-width="3.5" stroke-linecap="round"/>'
    s += f'<ellipse cx="74" cy="112" rx="7" ry="4" fill="{CHEEK}" opacity="0.6"/><ellipse cx="126" cy="112" rx="7" ry="4" fill="{CHEEK}" opacity="0.6"/>'
    s += f'<path d="M62,140 Q100,158 138,140 L140,152 Q100,170 60,152Z" fill="{RED}"/>'
    s += f'<path d="M116,150 L126,190 L112,192 L106,154Z" fill="{RED_S}"/>'
    for y in (178, 202, 226):
        s += f'<circle cx="100" cy="{y}" r="5.5" fill="{EYE}"/>'
    d.add(s); return d


def prop_star():
    d = Doc(200, 200)
    d.add(f'<path d="{star_path(100, 106, 86, 40)}" fill="{GOLD_S}" stroke="{GOLD_S}" stroke-width="14" stroke-linejoin="round"/>')
    d.add(f'<path d="{star_path(96, 100, 84, 39)}" fill="{GOLD}" stroke="{GOLD}" stroke-width="10" stroke-linejoin="round"/>')
    d.add(sparkle(74, 82, 10, "#FFFFFF")); return d


def prop_snowflake():
    d = Doc(200, 200)
    s = '<g transform="translate(100 100)" stroke-linecap="round" fill="none">'
    for color, w in (("#7FB2E5", 16), ("#EAF4FF", 9)):
        for k in range(6):
            s += (f'<path transform="rotate({k*60})" stroke="{color}" stroke-width="{w}" '
                  f'd="M0,0 L0,-78 M0,-44 L20,-64 M0,-44 L-20,-64"/>')
    d.add(s + "</g>"); return d


PROPS = [
    ("santa-hat", "Santa hat", prop_hat),
    ("antlers", "Reindeer antlers", prop_antlers),
    ("red-nose", "Red nose", prop_nose),
    ("glasses", "Nexford specs", prop_glasses),
    ("star-glasses", "Star glasses", prop_star_glasses),
    ("gift-red", "Red gift", prop_gift(RED, RED_S, GOLD, GOLD_S)),
    ("gift-blue", "Blue gift", prop_gift("#4A86D4", "#2F63A8", WHITE, SNOW_S)),
    ("cocoa", "Hot cocoa", prop_mug),
    ("candy-cane", "Candy cane", prop_candy),
    ("ornament-red", "Red ornament", prop_ornament(RED, RED_S)),
    ("ornament-gold", "Gold ornament", prop_ornament(GOLD, GOLD_S)),
    ("tree", "Christmas tree", prop_tree),
    ("mistletoe", "Mistletoe", prop_mistletoe),
    ("snowman", "Snowman", prop_snowman),
    ("star", "Gold star", prop_star),
    ("snowflake", "Snowflake", prop_snowflake),
]

if __name__ == "__main__":
    import sys, os
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    for slug, name, fn in PROPS:
        open(os.path.join(out, slug + ".svg"), "w").write(fn().svg())
    print("ok")
