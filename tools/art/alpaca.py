"""The Nexford alpaca, v2 (flat sticker style)."""
from kit import *

EAR_O = "M0,0 C-17,-14 -17,-44 0,-60 C17,-44 17,-14 0,0Z"
EAR_I = "M0,-11 C-8,-21 -8,-38 0,-48 C8,-38 8,-21 0,-11Z"
FACE_D = "M-47,-28 C-41,-46 41,-46 47,-28 C55,-4 53,26 39,47 C27,64 -27,64 -39,47 C-53,26 -55,-4 -47,-28Z"
FACE_BB = (-55, -46, 55, 64)
EYE_Y = 6


def eye(x, kind="dot"):
    y = EYE_Y
    if kind == "happy":
        return (f'<path d="M{f(x-8)},{f(y+3)} Q{f(x)},{f(y-7)} {f(x+8)},{f(y+3)}" fill="none" stroke="{EYE}" '
                f'stroke-width="4.6" stroke-linecap="round"/>')
    if kind == "closed":
        return (f'<path d="M{f(x-8)},{f(y)} Q{f(x)},{f(y+6)} {f(x+8)},{f(y)}" fill="none" stroke="{EYE}" '
                f'stroke-width="4.2" stroke-linecap="round"/>')
    return (f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="7.2" ry="8.8" fill="{EYE}"/>'
            f'<circle cx="{f(x-2.4)}" cy="{f(y-3.3)}" r="2.7" fill="#fff"/>'
            f'<circle cx="{f(x+2.3)}" cy="{f(y+3.2)}" r="1.2" fill="#fff" opacity="0.8"/>')


def mouth(kind="smile"):
    if kind == "open":
        return (f'<path d="M0,28 L0,31" stroke="{NOSE}" stroke-width="2.6" stroke-linecap="round"/>'
                f'<path d="M-9,32 Q0,33.5 9,32 Q8,45 0,45 Q-8,45 -9,32Z" fill="{MOUTH}"/>'
                f'<path d="M-5,41.5 Q0,37.5 5,41.5 Q3.5,44.5 0,44.5 Q-3.5,44.5 -5,41.5Z" fill="{TONGUE}"/>')
    if kind == "o":
        return (f'<path d="M0,28 L0,31" stroke="{NOSE}" stroke-width="2.6" stroke-linecap="round"/>'
                f'<ellipse cx="0" cy="38" rx="4.6" ry="5.6" fill="{MOUTH}"/>')
    return (f'<path d="M0,28 L0,32 M-8,33 Q-4,38 0,32 Q4,38 8,33" fill="none" stroke="{NOSE}" '
            f'stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>')


def head(doc, eyes=("dot", "dot"), mouth_kind="smile", ear_angle=28, behind="", hat="", front="", nose=NOSE,
         cheeks=True):
    s = behind
    # ears
    for side in (-1, 1):
        s += (f'<g transform="translate({44*side} -46) rotate({ear_angle*side})">'
              + blob(doc, [("p", EAR_O, (-17, -60, 17, 0))], FUR, FUR_S, dx=-3 * side, dy=-3)
              + f'<path d="{EAR_I}" fill="{EAR_IN}"/></g>')
    # wool
    wool = cloud(0, 2, 80, 72, 11, 23, seed=4)
    s += blob(doc, wool, FUR, FUR_S, dx=-6, dy=-8,
              extra=f'<ellipse cx="-44" cy="-36" rx="16" ry="9" fill="{FUR_HI}" opacity="0.55" transform="rotate(-35 -44 -36)"/>')
    # face
    s += blob(doc, [("p", FACE_D, FACE_BB)], FACE, FACE_S, dx=-3, dy=-5,
              extra=f'<ellipse cx="0" cy="33" rx="24" ry="17" fill="#FBEDE1"/>')
    # top knot (fluffy fringe over the forehead)
    knot = [("c", -34, -42, 18), ("c", -14, -54, 21), ("c", 11, -55, 21), ("c", 33, -44, 18),
            ("c", -20, -34, 13), ("c", 0, -38, 15), ("c", 20, -34, 13)]
    s += blob(doc, knot, FUR, FUR_S, dx=-4, dy=-6,
              extra=f'<ellipse cx="-14" cy="-60" rx="11" ry="5.5" fill="{FUR_HI}" opacity="0.7"/>')
    s += hat
    # features
    s += eye(-23, eyes[0]) + eye(23, eyes[1])
    if cheeks:
        s += f'<ellipse cx="-39" cy="23" rx="9" ry="5.2" fill="{CHEEK}" opacity="0.6"/>'
        s += f'<ellipse cx="39" cy="23" rx="9" ry="5.2" fill="{CHEEK}" opacity="0.6"/>'
    s += f'<path d="M-7.5,20 Q0,17 7.5,20 Q6.5,27 0,28.5 Q-6.5,27 -7.5,20Z" fill="{nose}"/>'
    s += f'<ellipse cx="-2.5" cy="21" rx="2.4" ry="1.3" fill="#fff" opacity="0.45"/>'
    s += mouth(mouth_kind)
    s += front
    return f"<g>{s}</g>"


# ---------------- accessories ----------------
def glasses(color="#3A2A22"):
    s = ""
    for x in (-23, 23):
        s += f'<circle cx="{x}" cy="{EYE_Y}" r="15" fill="#FFFFFF" fill-opacity="0.18" stroke="{color}" stroke-width="3.4"/>'
        s += f'<path d="M{x-8},{EYE_Y-7} Q{x-4},{EYE_Y-10} {x},{EYE_Y-10}" stroke="#fff" stroke-width="2" opacity="0.8" fill="none" stroke-linecap="round"/>'
    s += f'<path d="M-8,{EYE_Y-2} Q0,{EYE_Y-7} 8,{EYE_Y-2}" fill="none" stroke="{color}" stroke-width="3.4" stroke-linecap="round"/>'
    s += f'<path d="M-38,{EYE_Y-2} L-50,{EYE_Y-7} M38,{EYE_Y-2} L50,{EYE_Y-7}" stroke="{color}" stroke-width="3.4" stroke-linecap="round"/>'
    return s


def santa_hat(doc, k=1.0):
    cone = ("p", "M-58,-50 C-50,-108 -4,-142 44,-136 C74,-132 92,-114 98,-90 C74,-104 58,-94 58,-50 Z", (-58, -142, 98, -50))
    s = blob(doc, [cone], RED, RED_S, dx=-6, dy=-6,
             extra='<path d="M-30,-96 C-14,-118 12,-128 34,-126" stroke="#fff" stroke-width="5" opacity="0.25" fill="none" stroke-linecap="round"/>')
    s += blob(doc, cloud(96, -88, 17, 17, 7, 8, seed=9), WHITE, SNOW_S, dx=-3, dy=-4)
    s += blob(doc, cloud(0, -50, 70, 15, 13, 11, seed=8), WHITE, SNOW_S, dx=-3, dy=-4)
    return f'<g transform="scale({k})">{s}</g>'


def antlers(color=BROWN, light="#C99064"):
    s = ""
    for side in (-1, 1):
        d = (f"M{-22*side},-50 C{-28*side},-80 {-38*side},-100 {-34*side},-128 "
             f"M{-31*side},-86 C{-48*side},-90 {-56*side},-100 {-58*side},-114 "
             f"M{-35*side},-108 C{-25*side},-114 {-21*side},-124 {-18*side},-136")
        s += f'<path d="{d}" fill="none" stroke="{color}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>'
        s += (f'<path d="M{-27*side},-74 C{-32*side},-92 {-35*side},-104 {-35*side},-118" fill="none" stroke="{light}" '
              f'stroke-width="3" stroke-linecap="round"/>')
    return s


def scarf(doc, cx=250, y=262, w=128):
    h = w / 2
    tail = ("p", f"M{f(cx+h*0.3)},{f(y+28)} L{f(cx+h*0.72)},{f(y+104)} Q{f(cx+h*0.48)},{f(y+114)} {f(cx+h*0.22)},{f(y+110)} L{f(cx+h*0.02)},{f(y+34)} Z",
            (cx, y + 28, cx + h * 0.72, y + 114))
    stripes = "".join(f'<path d="M{f(cx-10)},{f(y+56+i*26)} L{f(cx+h+10)},{f(y+44+i*26)}" stroke="{WHITE}" stroke-width="8"/>' for i in range(2))
    s = blob(doc, [tail], RED, RED_S, dx=-4, dy=-4, extra=stripes)
    band = ("p", f"M{f(cx-h)},{f(y)} C{f(cx-h*0.5)},{f(y+16)} {f(cx+h*0.5)},{f(y+16)} {f(cx+h)},{f(y)} L{f(cx+h+3)},{f(y+28)} "
                 f"C{f(cx+h*0.5)},{f(y+48)} {f(cx-h*0.5)},{f(y+48)} {f(cx-h-3)},{f(y+28)} Z", (cx - h - 3, y, cx + h + 3, y + 48))
    s += blob(doc, [band], RED, RED_S, dx=-4, dy=-5,
              extra=f'<path d="M{f(cx-h)},{f(y+18)} C{f(cx-h*0.4)},{f(y+33)} {f(cx+h*0.4)},{f(y+33)} {f(cx+h)},{f(y+18)}" stroke="{WHITE}" stroke-width="7" fill="none"/>')
    return s


def gift(doc, cx, cy, size=110, box=GREEN, box_s=GREEN_S, ribbon=GOLD, ribbon_s=GOLD_S):
    w, h = size, size * 0.74
    x0, y0 = cx - w / 2, cy - h / 2 + 8
    body = ("r", x0 + 5, y0 + 14, w - 10, h - 10, 6)
    lid = ("r", x0 - 3, y0, w + 6, 20, 5)
    s = blob(doc, [body], box, box_s, dx=-5, dy=-5, extra=f'<rect x="{f(cx-8)}" y="{f(y0)}" width="16" height="{f(h+10)}" fill="{ribbon}"/>')
    s += blob(doc, [lid], box, box_s, dx=-4, dy=-4, extra=f'<rect x="{f(cx-8)}" y="{f(y0)}" width="16" height="22" fill="{ribbon}"/>')
    for d in (-1, 1):
        s += (f'<path d="M{f(cx)},{f(y0)} C{f(cx+d*size*0.36)},{f(y0-size*0.4)} {f(cx+d*size*0.52)},{f(y0-size*0.02)} {f(cx)},{f(y0)}Z" fill="{ribbon}"/>'
              f'<path d="M{f(cx)},{f(y0)} C{f(cx+d*size*0.2)},{f(y0-size*0.2)} {f(cx+d*size*0.3)},{f(y0-size*0.02)} {f(cx)},{f(y0)}Z" fill="{ribbon_s}"/>')
    s += f'<circle cx="{f(cx)}" cy="{f(y0)}" r="8" fill="{ribbon_s}"/>'
    return s


def mug(doc, cx, cy, size=80):
    w, h = size, size * 0.92
    x0, y0 = cx - w / 2, cy - h / 2
    s = (f'<path d="M{f(x0+w-4)},{f(y0+h*0.24)} c{f(w*0.42)},0 {f(w*0.42)},{f(h*0.5)} 0,{f(h*0.5)}" fill="none" '
         f'stroke="{RED_S}" stroke-width="10" stroke-linecap="round"/>')
    body = ("p", f"M{f(x0)},{f(y0)} h{f(w)} v{f(h-14)} q0,14 -14,14 h{f(-(w-28))} q-14,0 -14,-14 Z", (x0, y0, x0 + w, y0 + h))
    s += blob(doc, [body], RED, RED_S, dx=-5, dy=-4,
              extra=f'<rect x="{f(x0)}" y="{f(y0+h*0.42)}" width="{f(w)}" height="7" fill="{WHITE}"/>'
                    f'<rect x="{f(x0)}" y="{f(y0+h*0.6)}" width="{f(w)}" height="4" fill="{WHITE}"/>')
    s += f'<ellipse cx="{f(cx)}" cy="{f(y0+2)}" rx="{f(w/2-1)}" ry="8" fill="#6A3A22"/>'
    for i, (dx, dy) in enumerate([(-13, -3), (-1, -7), (11, -2)]):
        s += f'<rect x="{f(cx+dx-6)}" y="{f(y0+dy-4)}" width="12" height="10" rx="3" fill="#FFF7EE" transform="rotate({i*20-20} {f(cx+dx)} {f(y0+dy)})"/>'
    for dx in (-10, 9):
        s += (f'<path d="M{f(cx+dx)},{f(y0-14)} c-9,-10 9,-18 0,-30 c-7,-9 5,-16 2,-25" fill="none" stroke="#FFFFFF" '
              f'stroke-width="4.5" stroke-linecap="round" opacity="0.9"/>')
    return s


def heart(doc, cx, cy, size=100, color=RED, shade=RED_S):
    k = size / 100
    d = (f"M{f(cx)},{f(cy+38*k)} C{f(cx-60*k)},{f(cy)} {f(cx-56*k)},{f(cy-52*k)} {f(cx-24*k)},{f(cy-50*k)} "
         f"C{f(cx-8*k)},{f(cy-49*k)} {f(cx)},{f(cy-36*k)} {f(cx)},{f(cy-28*k)} "
         f"C{f(cx)},{f(cy-36*k)} {f(cx+8*k)},{f(cy-49*k)} {f(cx+24*k)},{f(cy-50*k)} "
         f"C{f(cx+56*k)},{f(cy-52*k)} {f(cx+60*k)},{f(cy)} {f(cx)},{f(cy+38*k)} Z")
    return blob(doc, [("p", d, (cx - 60 * k, cy - 52 * k, cx + 60 * k, cy + 38 * k))], color, shade, dx=-5, dy=-6,
                extra=f'<ellipse cx="{f(cx-26*k)}" cy="{f(cy-28*k)}" rx="{f(10*k)}" ry="{f(6*k)}" fill="#fff" opacity="0.5" transform="rotate(-35 {f(cx-26*k)} {f(cy-28*k)})"/>')


BULBS = ["#FF5A5F", "#FFD23F", "#4CC9F0", "#7BD389", "#FF9F43", "#B983FF"]


def light_string(points, seed=0, bulb=10):
    d = f"M{f(points[0][0])},{f(points[0][1])}"
    mids = []
    for i in range(1, len(points)):
        (x0, y0), (x1, y1) = points[i - 1], points[i]
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2 + 16
        d += f" Q{f(mx)},{f(my)} {f(x1)},{f(y1)}"
        mids.append(((x0 + 2 * mx + x1) / 4, (y0 + 2 * my + y1) / 4, math.degrees(math.atan2(y1 - y0, x1 - x0))))
    s = f'<path d="{d}" fill="none" stroke="#24563A" stroke-width="3.5" stroke-linecap="round"/>'
    for i, (bx, by, ang) in enumerate(mids):
        c = BULBS[(i + seed) % len(BULBS)]
        s += (f'<g transform="translate({f(bx)} {f(by)}) rotate({f(ang + (14 if i % 2 else -14))})">'
              f'<circle cx="0" cy="{f(bulb*1.3)}" r="{f(bulb*1.7)}" fill="{c}" opacity="0.25"/>'
              f'<rect x="-4.5" y="-1" width="9" height="8" rx="2" fill="#2E6B47"/>'
              f'<ellipse cx="0" cy="{f(bulb*1.15)}" rx="{f(bulb*0.72)}" ry="{f(bulb)}" fill="{c}"/>'
              f'<ellipse cx="-2.5" cy="{f(bulb*0.85)}" rx="2.2" ry="3.6" fill="#fff" opacity="0.7"/></g>')
    return s
