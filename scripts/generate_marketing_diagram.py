"""Vestream — marketing overview diagram (non-technical, anyone can understand)."""
from PIL import Image, ImageDraw, ImageFont
import os, math

# ── fonts ──────────────────────────────────────────────────────────────────
def font(size, bold=False):
    for path in [
        f"/System/Library/Fonts/Helvetica{'Bold' if bold else ''}.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
    ]:
        if os.path.exists(path):
            try: return ImageFont.truetype(path, size)
            except: pass
    return ImageFont.load_default()

def tw(draw, text, f):
    bb = draw.textbbox((0,0), text, font=f)
    return bb[2]-bb[0], bb[3]-bb[1]

def ctext(draw, text, cx, cy, f, color, line_gap=6):
    lines = text.split("\n")
    lh = tw(draw, "Ag", f)[1] + line_gap
    total = lh * len(lines) - line_gap
    for i, ln in enumerate(lines):
        w, _ = tw(draw, ln, f)
        draw.text((cx - w//2, cy - total//2 + i*lh), ln, font=f, fill=color)

def pill(draw, x, y, w, h, fill, outline=None, r=16, lw=2):
    draw.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=fill,
                            outline=outline, width=lw if outline else 0)

def arrow_h(draw, x1, x2, y, color, lw=2):
    draw.line([(x1,y),(x2,y)], fill=color, width=lw)
    d = 9
    sign = 1 if x2 > x1 else -1
    draw.polygon([(x2, y), (x2 - sign*d, y - d//2), (x2 - sign*d, y + d//2)], fill=color)

def arrow_v(draw, x, y1, y2, color, lw=2):
    draw.line([(x,y1),(x,y2)], fill=color, width=lw)
    d = 9
    sign = 1 if y2 > y1 else -1
    draw.polygon([(x, y2), (x - d//2, y2 - sign*d), (x + d//2, y2 - sign*d)], fill=color)

def dot_line_h(draw, x1, x2, y, color):
    step = 12
    x = x1
    while x < x2:
        draw.ellipse([x, y-1, x+5, y+1], fill=color)
        x += step

# ── canvas ─────────────────────────────────────────────────────────────────
W, H = 1800, 960
BG   = "#0b0d14"
img  = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# subtle grid
for x in range(0, W, 60):
    draw.line([(x,0),(x,H)], fill="#13162000", width=1)
for y in range(0, H, 60):
    draw.line([(0,y),(W,y)], fill="#ffffff05", width=1)

# ── palette ────────────────────────────────────────────────────────────────
TEAL   = "#00d4b4"
BLUE   = "#4f9cf9"
PURPLE = "#a78bfa"
AMBER  = "#fbbf24"
GREEN  = "#34d399"
PINK   = "#f472b6"
GRAY   = "#94a3b8"
WHITE  = "#f1f5f9"
DIM    = "#334155"
CARD   = "#141720"
CARD2  = "#1a1d2e"

F_HERO  = font(44, bold=True)
F_SUB   = font(18)
F_H2    = font(22, bold=True)
F_H3    = font(17, bold=True)
F_BODY  = font(15)
F_SM    = font(13)
F_XS    = font(11)
F_TAG   = font(12, bold=True)

# ═══════════════════════════════════════════════════════════════════════════
# HEADER
# ═══════════════════════════════════════════════════════════════════════════
title = "How Vestream Works"
w, _ = tw(draw, title, F_HERO)
draw.text((W//2 - w//2, 30), title, font=F_HERO, fill=WHITE)

sub = "One platform for token vesting data — for investors, teams, and AI agents"
w, _ = tw(draw, sub, F_SUB)
draw.text((W//2 - w//2, 90), sub, font=F_SUB, fill=GRAY)

# ═══════════════════════════════════════════════════════════════════════════
# THREE COLUMNS  (sources | vestream | who benefits)
# row Y starts at 140
# ═══════════════════════════════════════════════════════════════════════════

ROW1_Y = 150   # column headers
ROW2_Y = 220   # top of cards
CARD_H = 500
COL_W  = 340

# column centres
CX = [210, 680, 900, 1120, 1590]
#      sources  |   vestream core   |   beneficiaries

# ── divider lines ──────────────────────────────────────────────────────────
for x in [460, 1330]:
    for y in range(ROW2_Y, ROW2_Y + CARD_H, 14):
        draw.ellipse([x-1, y, x+1, y+2], fill=DIM)

# ─────────────────────────────────────────────────────────
# COLUMN 1 — Data Sources
# ─────────────────────────────────────────────────────────
pill(draw, 30, ROW1_Y, 380, 40, CARD2, TEAL, r=20)
ctext(draw, "📡  Where the data comes from", 220, ROW1_Y+20, F_H3, TEAL)

platforms = [
    ("Sablier",        "Streaming vesting",     TEAL),
    ("UNCX",           "Token locks & vesting", BLUE),
    ("Hedgey",         "On-chain grants",        PURPLE),
    ("Team Finance",   "Team token vesting",     AMBER),
    ("Unvest",         "Vesting schedules",      GREEN),
]

py = ROW2_Y + 20
for name, desc, col in platforms:
    pill(draw, 40, py, 360, 68, CARD, col, r=12, lw=2)
    draw.text((70, py+10), name, font=F_H3, fill=col)
    draw.text((70, py+36), desc, font=F_SM,  fill=GRAY)
    py += 86

# chain badges
py += 10
chains = [("Ethereum", "#627eea"), ("Base", "#0052ff"), ("BSC", "#f0b90b")]
cx_start = 60
for chain, col in chains:
    w, _ = tw(draw, chain, F_XS)
    pill(draw, cx_start, py, w+20, 26, col+"22", col, r=13, lw=1)
    ctext(draw, chain, cx_start + (w+20)//2, py+13, F_XS, col)
    cx_start += w + 34
draw.text((60, py+34), "All on-chain · publicly verifiable data", font=F_XS, fill=GRAY)

# ─────────────────────────────────────────────────────────
# COLUMN 2 — Vestream Core  (centre)
# ─────────────────────────────────────────────────────────
pill(draw, 480, ROW1_Y, 800, 40, CARD2, AMBER, r=20)
ctext(draw, "⚡  Vestream — the data layer", 880, ROW1_Y+20, F_H3, AMBER)

# big centre glow card
pill(draw, 490, ROW2_Y, 780, CARD_H, "#0f1520", AMBER, r=20, lw=2)

# step 1
pill(draw, 520, ROW2_Y+30, 720, 90, CARD2, TEAL, r=14, lw=2)
draw.text((548, ROW2_Y+42), "1", font=font(32, bold=True), fill=TEAL)
draw.text((596, ROW2_Y+42), "Collect", font=F_H3, fill=WHITE)
draw.text((596, ROW2_Y+66), "Pull vesting data from every\nmajor protocol automatically", font=F_SM, fill=GRAY)

arrow_v(draw, 880, ROW2_Y+122, ROW2_Y+152, AMBER)

# step 2
pill(draw, 520, ROW2_Y+154, 720, 90, CARD2, BLUE, r=14, lw=2)
draw.text((548, ROW2_Y+166), "2", font=font(32, bold=True), fill=BLUE)
draw.text((596, ROW2_Y+166), "Normalise", font=F_H3, fill=WHITE)
draw.text((596, ROW2_Y+190), "Standardise into one clean\nformat across all platforms", font=F_SM, fill=GRAY)

arrow_v(draw, 880, ROW2_Y+246, ROW2_Y+276, AMBER)

# step 3
pill(draw, 520, ROW2_Y+278, 720, 90, CARD2, PURPLE, r=14, lw=2)
draw.text((548, ROW2_Y+290), "3", font=font(32, bold=True), fill=PURPLE)
draw.text((596, ROW2_Y+290), "Store & Cache", font=F_H3, fill=WHITE)
draw.text((596, ROW2_Y+314), "Save results so responses\nare instant, not slow chain reads", font=F_SM, fill=GRAY)

arrow_v(draw, 880, ROW2_Y+370, ROW2_Y+400, AMBER)

# step 4
pill(draw, 520, ROW2_Y+402, 720, 90, CARD2, GREEN, r=14, lw=2)
draw.text((548, ROW2_Y+414), "4", font=font(32, bold=True), fill=GREEN)
draw.text((596, ROW2_Y+414), "Serve", font=F_H3, fill=WHITE)
draw.text((596, ROW2_Y+438), "Deliver data to your dashboard,\nour API, or any AI agent", font=F_SM, fill=GRAY)

# ─────────────────────────────────────────────────────────
# COLUMN 3 — Who Benefits
# ─────────────────────────────────────────────────────────
pill(draw, 1350, ROW1_Y, 410, 40, CARD2, PURPLE, r=20)
ctext(draw, "🎯  Who it's for", 1555, ROW1_Y+20, F_H3, PURPLE)

beneficiaries = [
    (
        "👤  Crypto Investors",
        BLUE,
        "Track all your vesting schedules\nfrom every platform in one place.\nSee exactly when tokens unlock.",
        ["Early access dashboard", "Wallet connect", "Unlock calendar"],
    ),
    (
        "🧑‍💻  Developers & Teams",
        GREEN,
        "Query vesting data via our\nclean REST API. Build tools,\nalerts, and dashboards on top.",
        ["REST API", "Swagger docs", "Usage dashboard"],
    ),
    (
        "🤖  AI Agents",
        PURPLE,
        "Give your agent real-time\nvesting data as a tool. Works\nwith Claude, Cursor, and more.",
        ["MCP server", "npm package", "3 ready-made tools"],
    ),
]

by = ROW2_Y + 10
for title_b, col, desc, tags in beneficiaries:
    pill(draw, 1360, by, 400, 148, CARD, col, r=14, lw=2)
    draw.text((1385, by+14), title_b, font=F_H3, fill=col)
    draw.text((1385, by+44), desc, font=F_SM, fill=GRAY)
    # tags
    tx = 1385
    for tag in tags:
        tw_, _ = tw(draw, tag, F_XS)
        pill(draw, tx, by+112, tw_+16, 22, col, col, r=11, lw=1)
        ctext(draw, tag, tx + (tw_+16)//2, by+123, F_XS, "#0b0d14")
        tx += tw_ + 24
    by += 166

# ═══════════════════════════════════════════════════════════════════════════
# ARROWS  (sources → vestream, vestream → beneficiaries)
# ═══════════════════════════════════════════════════════════════════════════
mid_y = ROW2_Y + CARD_H//2

# sources → vestream
arrow_h(draw, 408, 488, mid_y, TEAL, lw=3)
ctext(draw, "live data", 447, mid_y-16, F_XS, TEAL)

# vestream → beneficiaries
arrow_h(draw, 1272, 1358, mid_y, PURPLE, lw=3)
ctext(draw, "instant answers", 1315, mid_y-16, F_XS, PURPLE)

# ═══════════════════════════════════════════════════════════════════════════
# BOTTOM BAR — key stats / trust signals
# ═══════════════════════════════════════════════════════════════════════════
BAR_Y = ROW2_Y + CARD_H + 40
pill(draw, 40, BAR_Y, W-80, 80, CARD2, DIM, r=16, lw=1)

stats = [
    ("5",          "Vesting protocols supported"),
    ("3",          "Blockchains indexed"),
    ("< 200ms",    "Typical API response time"),
    ("Real-time",  "Cache refreshed automatically"),
    ("100%",       "On-chain · publicly verifiable"),
]
sx = 100
for val, label in stats:
    draw.text((sx, BAR_Y+10), val, font=font(22, bold=True), fill=TEAL)
    w_, _ = tw(draw, label, F_XS)
    draw.text((sx, BAR_Y+42), label, font=F_XS, fill=GRAY)
    sx += max(w_, tw(draw, val, font(22, bold=True))[0]) + 80

# footer
foot = "vestream.io  ·  Token vesting data infrastructure"
w_, _ = tw(draw, foot, F_XS)
draw.text((W//2-w_//2, BAR_Y+100), foot, font=F_XS, fill=DIM)

out = "/Users/howardpearce/vestr/scripts/diagram_marketing.png"
img.save(out, "PNG")
print(f"Saved: {out}")
