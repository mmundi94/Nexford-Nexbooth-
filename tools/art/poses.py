"""Nexbooth alpaca poses, v2."""
from kit import *
from alpaca import *

HX, HY, HS = 250, 168, 1.36


def ground(*a, **k):
    return ""


def body(doc, legs=True, hind=True, lift=0, tail=False):
    L = lift
    s = ""
    if tail:
        s += blob(doc, cloud(326, 356 - L, 18, 18, 6, 9, seed=31), FUR, FUR_S, dx=-3, dy=-4)
    shapes = (cloud(250, 296 - L, 40, 46, 7, 16, seed=21) + cloud(250, 384 - L, 82, 70, 10, 22, seed=22)
              + cloud(184, 418 - L, 40, 36, 6, 16, seed=23) + cloud(316, 418 - L, 40, 36, 6, 16, seed=24))
    s += blob(doc, shapes, FUR, FUR_S, dx=-6, dy=-8,
              extra=f'<ellipse cx="250" cy="{284 - L}" rx="44" ry="14" fill="{FUR_D}" opacity="0.35"/>'
                    f'<ellipse cx="232" cy="{364 - L}" rx="34" ry="24" fill="{FUR_HI}" opacity="0.35"/>')
    if hind:
        s += nub(doc, 186, 452 - L, 17, 15, 20, tip=9) + nub(doc, 314, 452 - L, 17, 15, -20, tip=9)
    if legs:
        s += nub(doc, 230, 450 - L, 17, 16, 4, tip=9) + nub(doc, 270, 450 - L, 17, 16, -4, tip=9)
    return s


def H(doc, rot=0, lift=0, **kw):
    return place(head(doc, **kw), HX, HY - lift, HS, rot)


def wiggle(x, y, side=1):
    return "".join(f'<path d="M{f(x + side*(10+i*10))},{f(y - 18 + i*3)} q{f(side*8)},18 0,{f(36 - i*6)}" fill="none" '
                   f'stroke="{FUR_D}" stroke-width="4" stroke-linecap="round" opacity="{0.8 - i*0.25}"/>' for i in range(2))


def pose_wave():
    d = Doc(500, 520)
    s = ground() + body(d, legs=False, tail=True)
    s += nub(d, 230, 450, 17, 16, 4, tip=9) + nub(d, 270, 450, 17, 16, -4, tip=9)
    s += nub(d, 204, 352, 14, 20, 18, tip=8)
    s += H(d, rot=-6, mouth_kind="open")
    s += limb(d, 282, 340, 326, 290, w=34, tip=12, shadow=False)
    s += wiggle(344, 268)
    d.add(s); return d


def pose_cheer():
    d = Doc(500, 520)
    lift = 26
    s = ground(rx=95, ry=9) + body(d, legs=False, hind=False, lift=lift)
    s += nub(d, 192, 450 - lift, 15, 17, 30, tip=9) + nub(d, 308, 450 - lift, 15, 17, -30, tip=9)
    s += nub(d, 232, 452 - lift, 15, 18, 6, tip=9) + nub(d, 268, 452 - lift, 15, 18, -6, tip=9)
    s += limb(d, 216, 340 - lift, 172, 292 - lift, w=34, tip=12, shadow=False) + limb(d, 284, 340 - lift, 328, 292 - lift, w=34, tip=12, shadow=False)
    s += H(d, lift=lift, eyes=("happy", "happy"), mouth_kind="open")
    for (x, y, r, c) in [(92, 210, 14, GOLD), (410, 196, 12, "#FF7A85"), (74, 330, 9, "#4CC9F0"), (430, 330, 10, GOLD), (380, 70, 8, "#7BD389")]:
        s += sparkle(x, y, r, c)
    d.add(s); return d


def pose_heart():
    d = Doc(500, 520)
    s = ground() + body(d)
    s += H(d, rot=5, eyes=("happy", "happy"))
    s += heart(d, 250, 400, size=104)
    s += nub(d, 204, 392, 14, 20, -20, tip=8) + nub(d, 296, 392, 14, 20, 20, tip=8)
    s += sparkle(108, 300, 13, "#FF7A85") + sparkle(398, 250, 10, GOLD)
    d.add(s); return d


def pose_santa():
    d = Doc(500, 540)
    s = '<g transform="translate(0 30)">' + ground() + body(d, tail=True)
    s += H(d, rot=-4, ear_angle=62, hat=santa_hat(d))
    s += gift(d, 250, 404, size=110)
    s += nub(d, 198, 398, 14, 20, -15, tip=8) + nub(d, 302, 398, 14, 20, 15, tip=8)
    s += "</g>"
    d.add(s); return d


def pose_cocoa():
    d = Doc(500, 520)
    s = ground() + body(d)
    s += scarf(d, 250, 266, 112)
    s += H(d, rot=6, front=glasses())
    s += mug(d, 244, 402, size=76)
    s += nub(d, 212, 404, 13, 18, -25, tip=8) + nub(d, 280, 408, 13, 18, 25, tip=8)
    d.add(s); return d


def pose_lights():
    d = Doc(500, 520)
    s = ground() + body(d)
    s += light_string([(170, 358), (218, 376), (276, 380), (330, 362), (342, 396)], seed=0)
    s += light_string([(150, 430), (200, 446), (258, 452), (312, 446), (350, 428)], seed=3)
    s += H(d, rot=-3, mouth_kind="o")
    s += light_string([(204, 290), (234, 304), (268, 306), (298, 290)], seed=1, bulb=9)
    d.add(s); return d


def pose_peek():
    d = Doc(420, 470)
    s = blob(d, cloud(212, 420, 54, 150, 10, 18, seed=41), FUR, FUR_S, dx=-6, dy=-8,
             extra=f'<ellipse cx="212" cy="296" rx="54" ry="16" fill="{FUR_D}" opacity="0.35"/>')
    s += place(head(d, eyes=("happy", "dot"), mouth_kind="open", ear_angle=24), 204, 190, 1.3, -12)
    d.add(s); return d


def pose_reindeer():
    d = Doc(400, 400)
    h = head(d, eyes=("dot", "happy"), mouth_kind="open", ear_angle=52, nose="#E2444A", behind=antlers(),
             front='<circle cx="0" cy="23" r="16" fill="#FF5A5F" opacity="0.18"/>')
    d.add(place(h, 200, 236, 1.3, -6)); return d


def pose_head():
    d = Doc(400, 400)
    d.add(place(head(d), 200, 214, 1.35)); return d


POSES = [
    ("alpaca-wave", "Waving hello", pose_wave),
    ("alpaca-cheer", "Jumping for joy", pose_cheer),
    ("alpaca-heart", "Big heart", pose_heart),
    ("alpaca-santa", "Santa with a gift", pose_santa),
    ("alpaca-cocoa", "Cozy cocoa", pose_cocoa),
    ("alpaca-lights", "Tangled in lights", pose_lights),
    ("alpaca-peek", "Photobomb", pose_peek),
    ("alpaca-reindeer", "Reindeer wink", pose_reindeer),
]

if __name__ == "__main__":
    import sys, os
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    for slug, name, fn in POSES + [("alpaca-head", "Head", pose_head)]:
        open(os.path.join(out, slug + ".svg"), "w").write(fn().svg())
    print("ok")
