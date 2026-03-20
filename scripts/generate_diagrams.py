"""Generate Vestream architecture diagrams as PNG files."""
from PIL import Image, ImageDraw, ImageFont
import os

# ── helpers ────────────────────────────────────────────────────────────────

def load_font(size, bold=False):
    candidates = [
        f"/System/Library/Fonts/{'SFPro-Bold' if bold else 'SFPro-Regular'}.ttf",
        f"/System/Library/Fonts/Helvetica{'Bold' if bold else ''}.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()

def text_size(draw, text, font):
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[2] - bb[0], bb[3] - bb[1]

def draw_box(draw, x, y, w, h, fill, border, radius=10):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill, outline=border, width=2)

def draw_diamond(draw, cx, cy, hw, hh, fill, border):
    pts = [(cx, cy - hh), (cx + hw, cy), (cx, cy + hh), (cx - hw, cy)]
    draw.polygon(pts, fill=fill, outline=border)
    draw.line([pts[0], pts[1]], fill=border, width=2)
    draw.line([pts[1], pts[2]], fill=border, width=2)
    draw.line([pts[2], pts[3]], fill=border, width=2)
    draw.line([pts[3], pts[0]], fill=border, width=2)

def center_text(draw, text, cx, cy, font, color="#111111"):
    lines = text.split("\n")
    line_h = text_size(draw, "Ay", font)[1] + 2
    total_h = line_h * len(lines)
    start_y = cy - total_h // 2
    for i, line in enumerate(lines):
        w, _ = text_size(draw, line, font)
        draw.text((cx - w // 2, start_y + i * line_h), line, font=font, fill=color)

def arrow(draw, x1, y1, x2, y2, color="#555555", label=None, label_font=None):
    draw.line([(x1, y1), (x2, y2)], fill=color, width=2)
    # arrowhead
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    size = 8
    for a in [angle + 2.5, angle - 2.5]:
        draw.line([(x2, y2), (x2 - size * math.cos(a), y2 - size * math.sin(a))], fill=color, width=2)
    if label and label_font:
        mx, my = (x1 + x2) // 2, (y1 + y2) // 2
        w, h = text_size(draw, label, label_font)
        draw.text((mx - w // 2, my - h - 2), label, font=label_font, fill=color)


# ══════════════════════════════════════════════════════════════════════════════
# DIAGRAM 1 — USER JOURNEYS
# ══════════════════════════════════════════════════════════════════════════════

W, H = 1800, 1100
BG   = "#f7f8fa"
img  = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

F_TITLE  = load_font(28, bold=True)
F_HEAD   = load_font(18, bold=True)
F_BODY   = load_font(14)
F_SMALL  = load_font(12)
F_LABEL  = load_font(11)

# ── palette ──
C_CON   = {"bg": "#e8f4fd", "border": "#2196f3", "head": "#1565c0"}  # consumer blue
C_DEV   = {"bg": "#e8f5e9", "border": "#4caf50", "head": "#2e7d32"}  # developer green
C_ADM   = {"bg": "#fce4ec", "border": "#e91e63", "head": "#880e4f"}  # admin pink
C_ARROW = "#666666"
C_DIA   = "#fff9c4"
C_DIA_B = "#f9a825"

# title
draw.text((W // 2 - 200, 20), "Vestream — User Journey Map", font=F_TITLE, fill="#1a1a2e")

# ── column positions ──
COL = [200, 700, 1350]  # consumer | developer | admin
BOX_W = 260
BOX_H = 52
DIA_HW, DIA_HH = 60, 30

def col_box(draw, col_idx, row_y, text, palette, is_diamond=False, is_oval=False):
    cx = COL[col_idx]
    if is_diamond:
        draw_diamond(draw, cx, row_y, DIA_HW + 20, DIA_HH + 10, C_DIA, C_DIA_B)
        center_text(draw, text, cx, row_y, F_SMALL, "#333")
        return
    x = cx - BOX_W // 2
    if is_oval:
        draw.ellipse([x, row_y - BOX_H // 2, x + BOX_W, row_y + BOX_H // 2],
                     fill=palette["head"], outline=palette["border"], width=2)
        center_text(draw, text, cx, row_y, F_BODY, "#ffffff")
    else:
        draw_box(draw, x, row_y - BOX_H // 2, BOX_W, BOX_H, palette["bg"], palette["border"])
        center_text(draw, text, cx, row_y, F_BODY, "#111")

# ── section headers ──
sections = [
    (COL[0], "👤  Consumer", C_CON),
    (COL[1], "🧑‍💻  B2B Developer", C_DEV),
    (COL[2], "🔐  Admin", C_ADM),
]
for cx, label, pal in sections:
    draw_box(draw, cx - 155, 60, 310, 40, pal["head"], pal["border"], radius=8)
    w, _ = text_size(draw, label, F_HEAD)
    draw.text((cx - w // 2, 68), label, font=F_HEAD, fill="#ffffff")

# ── Consumer column ──
rows_c = [130, 200, 270, 340, 410, 490, 570, 650, 730, 820]
steps_c = [
    ("Visit Homepage", False, True),
    ("Join Waitlist\n(enter email)", False, False),
    ("Email stored in database", False, False),
    ("Receive Early Access Code", False, False),
    ("Enter code at /early-access", False, False),
    ("Code Valid?", True, False),
    ("Cookie set:\nvestr_early_access", False, False),
    ("Access /dashboard", False, False),
    ("Connect crypto wallet", False, False),
    ("View vesting streams\n& upcoming unlocks 🎉", False, False),
]
for i, (txt, is_dia, is_oval) in enumerate(steps_c):
    col_box(draw, 0, rows_c[i], txt, C_CON, is_dia, is_oval)
    if i < len(rows_c) - 1:
        next_y = rows_c[i + 1]
        cur_y  = rows_c[i]
        if is_dia:
            # Yes arrow (straight down)
            arrow(draw, COL[0], cur_y + DIA_HH + 10, COL[0], next_y - BOX_H // 2, C_ARROW, "Yes", F_LABEL)
            # No arrow (loop back)
            arrow(draw, COL[0] + DIA_HW + 20, cur_y, COL[0] + 150, cur_y, C_ARROW)
            arrow(draw, COL[0] + 150, cur_y, COL[0] + 150, rows_c[i - 1], C_ARROW)
            arrow(draw, COL[0] + 150, rows_c[i - 1], COL[0] + BOX_W // 2, rows_c[i - 1], C_ARROW, "No", F_LABEL)
        else:
            arrow(draw, COL[0], cur_y + (BOX_H // 2 if not is_oval else BOX_H // 2),
                  COL[0], next_y - (DIA_HH + 10 if steps_c[i + 1][1] else BOX_H // 2), C_ARROW)

# ── Developer column ──
rows_d = [130, 200, 270, 340, 420, 500, 580, 660, 740, 830, 920]
steps_d = [
    ("Visit /developer", False, True),
    ("Submit Request\nAccess Form", False, False),
    ("Request stored in DB", False, False),
    ("Pending Admin Approval", False, False),
    ("Admin Decision?", True, False),
    ("Receive API Key", False, False),
    ("Sign in at /developer/portal", False, False),
    ("Cookie set:\nvestr_api_access", False, False),
    ("/developer/account\n(usage dashboard)", False, False),
    ("/api-docs (Swagger UI)", False, False),
    ("Build with API or\nMCP Server 🚀", False, False),
]
for i, (txt, is_dia, is_oval) in enumerate(steps_d):
    col_box(draw, 1, rows_d[i], txt, C_DEV, is_dia, is_oval)
    if i < len(steps_d) - 1:
        if is_dia:
            arrow(draw, COL[1], rows_d[i] + DIA_HH + 10, COL[1], rows_d[i + 1] - BOX_H // 2, C_ARROW, "Approved", F_LABEL)
            # denied branch
            arrow(draw, COL[1] - DIA_HW - 20, rows_d[i], COL[1] - 190, rows_d[i], C_ARROW)
            draw_box(draw, COL[1] - 330, rows_d[i] - 22, 140, 44, "#ffebee", "#e53935", radius=8)
            center_text(draw, "Access\nDenied", COL[1] - 260, rows_d[i], F_SMALL, "#b71c1c")
        else:
            next_is_dia = steps_d[i + 1][1]
            y1 = rows_d[i] + (BOX_H // 2 if not is_oval else BOX_H // 2)
            y2 = rows_d[i + 1] - (DIA_HH + 10 if next_is_dia else BOX_H // 2)
            arrow(draw, COL[1], y1, COL[1], y2, C_ARROW)
    # branch: account and api-docs merge to final
    if i == 7:  # cookie box — branch into two
        # account
        arrow(draw, COL[1], rows_d[i] + BOX_H // 2, COL[1] - 60, rows_d[i + 1] - BOX_H // 2, C_ARROW)
        # api-docs
        arrow(draw, COL[1], rows_d[i] + BOX_H // 2, COL[1] + 60, rows_d[i + 1] - BOX_H // 2, C_ARROW)

# ── Admin column ──
rows_a = [130, 210, 300, 390, 470, 560]
steps_a = [
    ("Visit /admin", False, True),
    ("Password Correct?", True, False),
    ("Cookie set:\nvestr_admin", False, False),
    ("View Pending\nAccess Requests", False, False),
    ("Approve or\nRevoke Key", False, False),
    ("Key Issued /\nKey Revoked", False, False),
]
for i, (txt, is_dia, is_oval) in enumerate(steps_a):
    col_box(draw, 2, rows_a[i], txt, C_ADM, is_dia, is_oval)
    if i < len(steps_a) - 1:
        if is_dia:
            arrow(draw, COL[2], rows_a[i] + DIA_HH + 10, COL[2], rows_a[i + 1] - BOX_H // 2, C_ARROW, "Yes", F_LABEL)
            # No loop
            arrow(draw, COL[2] + DIA_HW + 20, rows_a[i], COL[2] + 160, rows_a[i], C_ARROW)
            arrow(draw, COL[2] + 160, rows_a[i], COL[2] + 160, rows_a[i - 1], C_ARROW)
            arrow(draw, COL[2] + 160, rows_a[i - 1], COL[2] + BOX_W // 2, rows_a[i - 1], C_ARROW, "No", F_LABEL)
        else:
            next_is_dia = steps_a[i + 1][1]
            y1 = rows_a[i] + BOX_H // 2
            y2 = rows_a[i + 1] - (DIA_HH + 10 if next_is_dia else BOX_H // 2)
            arrow(draw, COL[2], y1, COL[2], y2, C_ARROW)

# cross-column: admin approve → developer pending
ax_end = COL[2] - BOX_W // 2
ay = rows_a[5]
dx_end = COL[1] + BOX_W // 2
dy = rows_d[3]
draw.line([(ax_end, ay), (ax_end - 80, ay)], fill="#e91e63", width=2)
draw.line([(ax_end - 80, ay), (ax_end - 80, dy)], fill="#e91e63", width=2)
arrow(draw, ax_end - 80, dy, dx_end, dy, "#e91e63", "notifies", F_LABEL)

# footer note
note = "Arrows in pink show cross-journey interactions"
w, _ = text_size(draw, note, F_SMALL)
draw.text((W // 2 - w // 2, H - 30), note, font=F_SMALL, fill="#999999")

out1 = "/Users/howardpearce/vestr/scripts/diagram_user_journeys.png"
img.save(out1, "PNG")
print(f"Saved: {out1}")


# ══════════════════════════════════════════════════════════════════════════════
# DIAGRAM 2 — SYSTEM ARCHITECTURE
# ══════════════════════════════════════════════════════════════════════════════

W2, H2 = 1800, 1100
img2  = Image.new("RGB", (W2, H2), "#0f1117")
draw2 = ImageDraw.Draw(img2)

# dark palette
DARK = {
    "bg":    "#0f1117",
    "card":  "#1a1d27",
    "card2": "#141720",
    "blue":  "#3b82f6",
    "green": "#22c55e",
    "pink":  "#ec4899",
    "amber": "#f59e0b",
    "purple":"#a855f7",
    "gray":  "#6b7280",
    "text":  "#f1f5f9",
    "muted": "#94a3b8",
}

def dbox(draw, x, y, w, h, fill, border, radius=12, border_w=2):
    draw.rounded_rectangle([x, y, x+w, y+h], radius=radius, fill=fill, outline=border, width=border_w)

def dtext(draw, text, cx, cy, font, color):
    lines = text.split("\n")
    lh = text_size(draw, "Ay", font)[1] + 3
    total = lh * len(lines)
    for i, ln in enumerate(lines):
        w, _ = text_size(draw, ln, font)
        draw2.text((cx - w//2, cy - total//2 + i*lh), ln, font=font, fill=color)

def darrow(draw, x1, y1, x2, y2, color, label=None):
    import math
    draw.line([(x1,y1),(x2,y2)], fill=color, width=2)
    angle = math.atan2(y2-y1, x2-x1)
    size = 9
    for a in [angle+2.5, angle-2.5]:
        draw.line([(x2,y2),(x2-size*math.cos(a),y2-size*math.sin(a))], fill=color, width=2)
    if label:
        mx,my = (x1+x2)//2, (y1+y2)//2
        w,h = text_size(draw, label, F_LABEL)
        draw.rounded_rectangle([mx-w//2-3, my-h//2-2, mx+w//2+3, my+h//2+2], radius=3, fill="#1a1d27")
        draw.text((mx-w//2, my-h//2), label, font=F_LABEL, fill=color)

# title
draw2.text((W2//2 - 260, 18), "Vestream — System Architecture", font=F_TITLE, fill=DARK["text"])

# ── COLUMN layout ──────────────────────────────────────
# Col 1: Users        x=60
# Col 2: Vestream App x=380
# Col 3: Data stores  x=1060
# Col 4: Blockchain   x=1450

# ── USERS ──
dbox(draw2, 30, 70, 260, 560, "#16192a", DARK["blue"], radius=14)
draw2.text((80, 80), "Users", font=F_HEAD, fill=DARK["blue"])

users = [
    ("👤  Consumer", DARK["blue"], 140),
    ("🧑‍💻  B2B Developer", DARK["green"], 230),
    ("🔐  Admin", DARK["pink"], 320),
    ("🤖  AI Agent\n(Claude / Cursor)", DARK["purple"], 430),
]
for label, color, cy in users:
    dbox(draw2, 50, cy-30, 220, 60 if "\n" not in label else 75, "#0f1117", color, radius=8)
    dtext(draw2, label, 160, cy + (8 if "\n" in label else 0), F_BODY, color)

# ── NEXT.JS APP ──
dbox(draw2, 330, 70, 680, 780, "#13161f", DARK["amber"], radius=14, border_w=2)
draw2.text((430, 80), "Next.js App  —  Vercel", font=F_HEAD, fill=DARK["amber"])

# Public pages
dbox(draw2, 355, 115, 290, 80, "#1a1d27", DARK["muted"], radius=10)
dtext(draw2, "Public Pages\n/ · /developer · /early-access\n/resources · /pricing · /admin", 500, 155, F_SMALL, DARK["muted"])

# Gated areas
gates = [
    ("/dashboard\n🍪 vestr_early_access", DARK["blue"],   240),
    ("/developer/account · /api-docs\n🍪 vestr_api_access", DARK["green"], 320),
    ("/admin\n🍪 vestr_admin", DARK["pink"],  400),
]
for txt, color, cy in gates:
    dbox(draw2, 355, cy-35, 290, 65, "#1a1d27", color, radius=10)
    dtext(draw2, txt, 500, cy, F_SMALL, color)

# API block
dbox(draw2, 355, 460, 630, 370, "#0d0f18", DARK["amber"], radius=12, border_w=2)
draw2.text((420, 472), "Public REST API  /api/v1/*", font=load_font(15, bold=True), fill=DARK["amber"])

api_items = [
    ("🔑  Bearer Token Auth  vstr_live_... key", DARK["text"], 515),
    ("🚦  Rate Limiter:  30 req/min · 150/day · 1 000/mo", DARK["amber"], 555),
    ("GET  /wallet/{address}/vestings", DARK["green"],  600),
    ("GET  /wallet/{address}/upcoming-unlocks", DARK["green"],  635),
    ("GET  /stream/{streamId}", DARK["green"],  670),
    ("Burst · Daily · Monthly caps (Upstash Redis)", DARK["muted"], 715),
    ("DB cache — avoids redundant chain reads", DARK["muted"], 745),
    ("Responses: JSON, sub-200 ms (cached)", DARK["muted"], 775),
]
for txt, col, y in api_items:
    w, _ = text_size(draw2, txt, F_SMALL)
    draw2.text((375, y), txt, font=F_SMALL, fill=col)

# MCP server
dbox(draw2, 330, 860, 310, 90, "#1a1d27", DARK["purple"], radius=12)
dtext(draw2, "@vestream/mcp\nnpm package\n• get_vestings  • get_upcoming_unlocks  • get_stream", 485, 900, F_SMALL, DARK["purple"])

# ── DATA STORES ──
dbox(draw2, 1060, 70, 300, 440, "#13161f", DARK["green"], radius=14, border_w=2)
draw2.text((1100, 80), "Data Stores", font=F_HEAD, fill=DARK["green"])

stores = [
    ("☁️  Upstash Redis\nRate limit counters", DARK["amber"], 160),
    ("🗄  Supabase / Postgres", DARK["green"],  270),
    ("  Waitlist emails", DARK["muted"],         320),
    ("  API keys (hashed)", DARK["muted"],       348),
    ("  Vesting stream cache", DARK["muted"],    376),
    ("  Access requests", DARK["muted"],         404),
    ("📧  Resend\nTransactional email", DARK["blue"], 490),
]
for txt, col, cy in stores:
    if txt.startswith("  "):
        draw2.text((1090, cy-8), txt, font=F_SMALL, fill=col)
    else:
        dbox(draw2, 1075, cy-38, 270, 55 if "\n" in txt else 40, "#0f1117", col, radius=8)
        dtext(draw2, txt, 1210, cy, F_SMALL, col)

# ── BLOCKCHAIN ──
dbox(draw2, 1060, 540, 300, 310, "#13161f", DARK["purple"], radius=14, border_w=2)
draw2.text((1085, 552), "On-Chain Data", font=F_HEAD, fill=DARK["purple"])

chains = [
    ("Ethereum  (chain 1)", "#627eea", 610),
    ("  Sablier", DARK["muted"], 638),
    ("Base  (chain 8453)", "#0052ff", 680),
    ("  UNCX · Hedgey", DARK["muted"], 708),
    ("BSC  (chain 56)", "#f0b90b", 750),
    ("  Team Finance · Unvest", DARK["muted"], 778),
]
for txt, col, cy in chains:
    if txt.startswith("  "):
        draw2.text((1090, cy), txt, font=F_SMALL, fill=col)
    else:
        draw2.text((1080, cy), txt, font=load_font(13, bold=True), fill=col)

# ── ARROWS ──────────────────────────────────────────────────────────────────
# Consumer → public pages
darrow(draw2, 270, 140, 330, 155, DARK["blue"], "visits")
# Consumer → dashboard
darrow(draw2, 270, 140, 330, 240, DARK["blue"])
# Developer → public + gated
darrow(draw2, 270, 245, 330, 155, DARK["green"], "visits")
darrow(draw2, 270, 245, 330, 320, DARK["green"])
# Admin → admin gate
darrow(draw2, 270, 335, 330, 400, DARK["pink"])
# AI agent → MCP
darrow(draw2, 270, 460, 330, 900, DARK["purple"], "API key")
# MCP → API
darrow(draw2, 640, 900, 670, 700, DARK["purple"], "HTTP")
# Dev direct API
darrow(draw2, 270, 245, 355, 600, DARK["green"], "direct")
# API → Redis
darrow(draw2, 985, 600, 1060, 160, DARK["amber"], "rate check")
# API → Postgres
darrow(draw2, 985, 640, 1060, 360, DARK["green"], "cache r/w")
# API → Blockchain
darrow(draw2, 985, 680, 1060, 680, DARK["purple"], "fetch live")
# Admin gate → Postgres
darrow(draw2, 645, 400, 1060, 380, DARK["pink"], "approve/revoke")
# Resend
darrow(draw2, 1210, 490, 1210, 540, DARK["blue"])
darrow(draw2, 985, 515, 1075, 490, DARK["blue"], "send key")

# footer
note2 = "All API keys stored hashed · HTTPS everywhere · Read-only blockchain access · Middleware cookie gates per route"
w, _ = text_size(draw2, note2, F_SMALL)
draw2.text((W2//2 - w//2, H2 - 28), note2, font=F_SMALL, fill=DARK["muted"])

out2 = "/Users/howardpearce/vestr/scripts/diagram_architecture.png"
img2.save(out2, "PNG")
print(f"Saved: {out2}")
print("Done!")
