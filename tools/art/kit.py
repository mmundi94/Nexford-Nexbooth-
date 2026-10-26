"""Nexbooth art kit, v2: clean, flat sticker style (no heavy outlines, soft cel shading,
white die-cut sticker border)."""
import math, random

# palette
FUR = "#F3C878"; FUR_S = "#DDA65A"; FUR_D = "#C48A40"; FUR_HI = "#FCE3AE"
FACE = "#FFF9F1"; FACE_S = "#EFE0CE"
EYE = "#2E2019"; NOSE = "#4B3A32"; MOUTH = "#6E2F2B"; TONGUE = "#F08B80"
CHEEK = "#F7A491"; EAR_IN = "#F2B8A4"; TIP = "#9A7553"; TIP_S = "#7E5E42"
RED = "#E2444A"; RED_S = "#B92F37"; WHITE = "#FFFFFF"; SNOW_S = "#DCE6EE"
GREEN = "#3D9A6A"; GREEN_S = "#2A7550"; GOLD = "#F6C445"; GOLD_S = "#D99D22"
BROWN = "#A8744A"; BROWN_S = "#8A5C38"


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


class Doc:
    def __init__(self, w, h, border=7):
        self.w, self.h, self.border = w, h, border
        self.defs, self.body, self.n = [], [], 0

    def uid(self, p="i"):
        self.n += 1
        return f"{p}{self.n}"

    def add(self, s):
        self.body.append(s)

    def svg(self):
        flt = ""
        g_open, g_close = "<g>", "</g>"
        if self.border:
            flt = (f'<filter id="stk" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">'
                   f'<feMorphology in="SourceAlpha" operator="dilate" radius="{self.border}" result="d"/>'
                   f'<feFlood flood-color="#FFFFFF"/><feComposite in2="d" operator="in" result="b"/>'
                   f'<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')
            g_open = '<g filter="url(#stk)">'
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}">'
                f'<defs>{flt}{"".join(self.defs)}</defs>{g_open}{"".join(self.body)}{g_close}</svg>')


def el(sh, attrs=""):
    k = sh[0]
    if k == "c":
        return f'<circle cx="{f(sh[1])}" cy="{f(sh[2])}" r="{f(sh[3])}" {attrs}/>'
    if k == "e":
        return f'<ellipse cx="{f(sh[1])}" cy="{f(sh[2])}" rx="{f(sh[3])}" ry="{f(sh[4])}" {attrs}/>'
    if k == "r":  # rounded rect x,y,w,h,r
        return f'<rect x="{f(sh[1])}" y="{f(sh[2])}" width="{f(sh[3])}" height="{f(sh[4])}" rx="{f(sh[5])}" {attrs}/>'
    if k == "p":
        return f'<path d="{sh[1]}" {attrs}/>'
    raise ValueError(k)


def bbox(shapes):
    xs, ys = [], []
    for sh in shapes:
        if sh[0] == "c":
            xs += [sh[1] - sh[3], sh[1] + sh[3]]; ys += [sh[2] - sh[3], sh[2] + sh[3]]
        elif sh[0] == "e":
            xs += [sh[1] - sh[3], sh[1] + sh[3]]; ys += [sh[2] - sh[4], sh[2] + sh[4]]
        elif sh[0] == "r":
            xs += [sh[1], sh[1] + sh[3]]; ys += [sh[2], sh[2] + sh[4]]
        else:
            x0, y0, x1, y1 = sh[2]; xs += [x0, x1]; ys += [y0, y1]
    return min(xs), min(ys), max(xs), max(ys)


def blob(doc, shapes, base, shade, dx=-5, dy=-7, extra=""):
    """Flat shape with a soft shaded rim on the lower right (cel shading).
    `extra` is drawn inside the same clip (for highlights, tips, patterns)."""
    cp = doc.uid("c")
    doc.defs.append(f'<clipPath id="{cp}">' + "".join(el(sh) for sh in shapes) + "</clipPath>")
    x0, y0, x1, y1 = bbox(shapes)
    s = f'<g clip-path="url(#{cp})"><rect x="{f(x0-2)}" y="{f(y0-2)}" width="{f(x1-x0+4)}" height="{f(y1-y0+4)}" fill="{shade}"/>'
    s += f'<g transform="translate({dx} {dy})">' + "".join(el(sh, f'fill="{base}"') for sh in shapes) + "</g>"
    s += extra + "</g>"
    return s


def flat(shapes, fill, attrs=""):
    return "".join(el(sh, f'fill="{fill}" {attrs}') for sh in shapes)


def cloud(cx, cy, rx, ry, n, bump, seed=1, a0=0, jit=0.1):
    """Soft woolly cloud: a core ellipse plus a few large bumps around the edge."""
    r = random.Random(seed)
    out = [("e", cx, cy, rx, ry)]
    for i in range(n):
        a = math.radians(a0 + 360 * i / n + r.uniform(-6, 6))
        b = bump * (1 + r.uniform(-jit, jit))
        out.append(("c", cx + (rx - b * 0.55) * math.cos(a), cy + (ry - b * 0.55) * math.sin(a), b))
    return out


def capsule(L, w):
    """Rounded limb pointing down from (0,0), length L."""
    return ("r", -w / 2, -w / 2, w, L + w, w / 2)


def limb(doc, x1, y1, x2, y2, w=32, tip=13, shadow=True, base=FUR, shade=FUR_S):
    """Short stubby limb with a soft brown tip (no hooves, no fingers)."""
    L = math.hypot(x2 - x1, y2 - y1)
    ang = math.degrees(math.atan2(y2 - y1, x2 - x1)) - 90
    cap = capsule(L, w)
    tip_rect = f'<rect x="{f(-w/2)}" y="{f(L + w/2 - tip)}" width="{f(w)}" height="{f(tip+2)}" fill="{TIP}"/>'
    tip_rect += f'<rect x="{f(w/2-6)}" y="{f(L + w/2 - tip)}" width="6" height="{f(tip+2)}" fill="{TIP_S}"/>'
    s = f'<g transform="translate({f(x1)} {f(y1)}) rotate({f(ang)})">'
    if shadow:
        s += f'<g transform="translate(4 6)" opacity="0.75">' + el(cap, 'fill="' + FUR_D + '"') + '</g>'
    s += blob(doc, [cap], base, shade, dx=-4, dy=-3, extra=tip_rect if tip else "")
    s += el(cap, 'fill="none" stroke="' + FUR_D + '" stroke-width="2.6"')
    return s + "</g>"


def place(inner, x, y, scale=1.0, rot=0.0, flip=False):
    sx = -scale if flip else scale
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)}) scale({f(sx)} {f(scale)})">{inner}</g>'


def sparkle(x, y, r, color=GOLD):
    k = 0.2
    return (f'<path d="M{f(x)},{f(y-r)} Q{f(x+r*k)},{f(y-r*k)} {f(x+r)},{f(y)} Q{f(x+r*k)},{f(y+r*k)} {f(x)},{f(y+r)} '
            f'Q{f(x-r*k)},{f(y+r*k)} {f(x-r)},{f(y)} Q{f(x-r*k)},{f(y-r*k)} {f(x)},{f(y-r)}Z" fill="{color}"/>')


def nub(doc, cx, cy, rx=15, ry=21, rot=0, tip=10, shadow=True, base=FUR, shade=FUR_S):
    """Short, round, cute limb (arm or foot). The tip (bottom in local coords) is soft brown."""
    sh = ("e", 0, 0, rx, ry)
    t = (f'<rect x="{f(-rx)}" y="{f(ry - tip)}" width="{f(rx*2)}" height="{f(tip+2)}" fill="{TIP}"/>'
         f'<rect x="{f(rx*0.35)}" y="{f(ry - tip)}" width="{f(rx)}" height="{f(tip+2)}" fill="{TIP_S}"/>') if tip else ""
    s = f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(rot)})">'
    if shadow:
        s += f'<ellipse cx="3" cy="5" rx="{f(rx)}" ry="{f(ry)}" fill="{FUR_D}" opacity="0.7"/>'
    s += blob(doc, [sh], base, shade, dx=-3, dy=-4, extra=t)
    s += el(sh, 'fill="none" stroke="' + FUR_D + '" stroke-width="2.4"')
    return s + "</g>"
