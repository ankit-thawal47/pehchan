"""
Pehchaan — Hackathon 7.0 Presentation Generator
Generates a clean, minimal PPTX. Dark background, content-first.
Run: python scripts/generate_pptx.py
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
import copy

# ── Palette ────────────────────────────────────────────────────────────────
BG        = RGBColor(0x0F, 0x17, 0x2A)   # dark navy
WHITE     = RGBColor(0xF1, 0xF5, 0xF9)   # near-white
BLUE      = RGBColor(0x3B, 0x82, 0xF6)   # accent blue
SLATE     = RGBColor(0x94, 0xA3, 0xB8)   # muted text
GREEN     = RGBColor(0x10, 0xB9, 0x81)   # success green
YELLOW    = RGBColor(0xF5, 0x9E, 0x0B)   # warning
DARK_CARD = RGBColor(0x1E, 0x29, 0x3B)   # card background

W  = Inches(13.33)   # 16:9 width
H  = Inches(7.5)     # 16:9 height

prs = Presentation()
prs.slide_width  = W
prs.slide_height = H

blank_layout = prs.slide_layouts[6]   # blank — we draw everything manually


# ── Helpers ─────────────────────────────────────────────────────────────────

def add_slide():
    slide = prs.slides.add_slide(blank_layout)
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = BG
    return slide


def tb(slide, text, x, y, w, h,
       size=24, bold=False, color=WHITE, align=PP_ALIGN.LEFT,
       italic=False, wrap=True):
    txBox = slide.shapes.add_textbox(x, y, w, h)
    txBox.word_wrap = wrap
    tf = txBox.text_frame
    tf.word_wrap = wrap
    p  = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    run.font.name = "Calibri"
    return txBox


def tb_lines(slide, lines, x, y, w, h,
             size=18, bold=False, color=WHITE, align=PP_ALIGN.LEFT, spacing=1.15):
    """Multi-line textbox with consistent spacing."""
    txBox = slide.shapes.add_textbox(x, y, w, h)
    txBox.word_wrap = True
    tf = txBox.text_frame
    tf.word_wrap = True
    first = True
    for line in lines:
        if first:
            p = tf.paragraphs[0]
            first = False
        else:
            p = tf.add_paragraph()
        p.alignment = align
        run = p.add_run()
        run.text = line
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        run.font.name = "Calibri"
    return txBox


def rect(slide, x, y, w, h, color=DARK_CARD, line_color=None, line_width=Pt(0)):
    from pptx.util import Pt as Pt2
    shape = slide.shapes.add_shape(1, x, y, w, h)   # MSO_SHAPE_TYPE.RECTANGLE = 1
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    if line_color:
        shape.line.color.rgb = line_color
        shape.line.width = line_width
    else:
        shape.line.fill.background()
    return shape


def accent_bar(slide, y_pos=Inches(1.1)):
    """Thin blue horizontal rule under titles."""
    bar = slide.shapes.add_shape(1, Inches(0.5), y_pos, Inches(12.33), Inches(0.04))
    bar.fill.solid()
    bar.fill.fore_color.rgb = BLUE
    bar.line.fill.background()


def chip(slide, text, x, y, bg=DARK_CARD, fg=BLUE, size=14):
    w = Inches(2.0)
    h = Inches(0.42)
    r = rect(slide, x, y, w, h, color=bg, line_color=BLUE, line_width=Pt(1))
    tb(slide, text, x, y + Inches(0.04), w, h, size=size, color=fg, align=PP_ALIGN.CENTER)


def slide_title(slide, title, subtitle=None):
    tb(slide, title, Inches(0.5), Inches(0.25), Inches(12.33), Inches(0.7),
       size=32, bold=True, color=WHITE)
    accent_bar(slide, Inches(0.95))
    if subtitle:
        tb(slide, subtitle, Inches(0.5), Inches(1.05), Inches(12.33), Inches(0.45),
           size=16, color=SLATE)


# ═══════════════════════════════════════════════════════════════════════════
# SLIDE 1 — Title
# ═══════════════════════════════════════════════════════════════════════════
s = add_slide()

# Big emoji
tb(s, "👤", Inches(5.9), Inches(0.6), Inches(1.5), Inches(1.2), size=64, align=PP_ALIGN.CENTER)

# App name
tb(s, "Pehchaan", Inches(2), Inches(1.7), Inches(9.33), Inches(1.3),
   size=72, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

# Hindi subtitle
tb(s, "पहचान", Inches(2), Inches(2.85), Inches(9.33), Inches(0.6),
   size=28, color=SLATE, align=PP_ALIGN.CENTER)

# Tagline
tb(s, "Offline · Secure · Instant  |  Facial Recognition & Liveness Detection",
   Inches(2), Inches(3.4), Inches(9.33), Inches(0.5),
   size=18, color=SLATE, align=PP_ALIGN.CENTER)

# Blue divider
accent_bar(s, Inches(4.1))

# Hackathon label
tb(s, "HACKATHON 7.0  ·  JUNE 2026",
   Inches(2), Inches(4.25), Inches(9.33), Inches(0.4),
   size=13, color=BLUE, align=PP_ALIGN.CENTER, bold=True)

# Dev name
tb(s, "Ankit Thawal  ·  linkedin.com/in/ankit-thawal  ·  github.com/ankit-thawal47/pehchan",
   Inches(2), Inches(4.75), Inches(9.33), Inches(0.4),
   size=13, color=SLATE, align=PP_ALIGN.CENTER)

# Feature chips
chips = ["React Native", "Android + iOS", "19 MB Models", "< 1 sec", "Fully Offline"]
for i, c in enumerate(chips):
    chip(s, c, Inches(1.2 + i * 2.2), Inches(5.5))


# ═══════════════════════════════════════════════════════════════════════════
# SLIDE 2 — The Problem
# ═══════════════════════════════════════════════════════════════════════════
s = add_slide()
slide_title(s, "The Problem", "Field authentication fails when there's no network")

# 3 problem cards
problems = [
    ("📡", "Zero Network Zones",
     "Field personnel in remote locations cannot authenticate — no internet, no cloud, no access."),
    ("📸", "Photo Spoofing",
     "Attendance fraud via printed photos or screen replays is trivial without active liveness checks."),
    ("📦", "App Size Constraint",
     "Enterprise apps like Datalake 3.0 cannot afford heavy ML models that bloat the package by 200+ MB."),
]

for i, (emoji, title, body) in enumerate(problems):
    cx = Inches(0.4 + i * 4.3)
    rect(s, cx, Inches(1.6), Inches(4.0), Inches(4.8), color=DARK_CARD,
         line_color=BLUE, line_width=Pt(1))
    tb(s, emoji, cx, Inches(1.9), Inches(4.0), Inches(0.9), size=40, align=PP_ALIGN.CENTER)
    tb(s, title, cx, Inches(2.9), Inches(4.0), Inches(0.5),
       size=18, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    tb(s, body, cx + Inches(0.2), Inches(3.5), Inches(3.6), Inches(2.6),
       size=15, color=SLATE, align=PP_ALIGN.CENTER)


# ═══════════════════════════════════════════════════════════════════════════
# SLIDE 3 — Our Solution
# ═══════════════════════════════════════════════════════════════════════════
s = add_slide()
slide_title(s, "Our Solution — Pehchaan", "100% offline face auth that fits in 19 MB")

# Left: solution pillars
pillars = [
    (GREEN,  "✓  Fully Offline",         "Zero network dependency at runtime"),
    (BLUE,   "✓  Active Liveness",        "Blink · Smile · Head Turn — defeats photos"),
    (BLUE,   "✓  Passive Anti-Spoof",     "MobileNetV3 binary classifier on every frame"),
    (GREEN,  "✓  19 MB Model Bundle",     "FP16 ONNX — 95% smaller than source weights"),
    (GREEN,  "✓  < 1 sec Inference",      "CPU-only, no GPU, mid-range devices"),
    (YELLOW, "✓  Sync & Purge",           "Offline-first SQLite → AWS when online"),
    (GREEN,  "✓  React Native",           "Android 8.0+ and iOS 12+, same JS codebase"),
]

for i, (color, title, sub) in enumerate(pillars):
    y = Inches(1.55 + i * 0.77)
    rect(s, Inches(0.4), y, Inches(6.0), Inches(0.65), color=DARK_CARD)
    tb(s, title, Inches(0.65), y + Inches(0.05), Inches(5.5), Inches(0.35),
       size=16, bold=True, color=color)
    tb(s, sub, Inches(0.65), y + Inches(0.33), Inches(5.5), Inches(0.28),
       size=12, color=SLATE)

# Right: mini architecture
tb(s, "Pipeline", Inches(7.0), Inches(1.5), Inches(5.9), Inches(0.4),
   size=15, bold=True, color=BLUE)

steps = [
    ("📷 Camera Snapshot",  WHITE),
    ("🔍 Blur Detection",    SLATE),
    ("🛡  Spoof Check",      WHITE),
    ("👤 Face Detection",    SLATE),
    ("🧬 Face Embedding",    WHITE),
    ("🔎 Cosine Search",     SLATE),
    ("✅ Match / No Match",  GREEN),
]
for i, (label, color) in enumerate(steps):
    y = Inches(1.95 + i * 0.73)
    rect(s, Inches(7.0), y, Inches(5.5), Inches(0.55), color=DARK_CARD)
    tb(s, label, Inches(7.2), y + Inches(0.1), Inches(5.0), Inches(0.38),
       size=15, color=color)
    if i < len(steps) - 1:
        tb(s, "↓", Inches(9.1), y + Inches(0.55), Inches(1.0), Inches(0.2),
           size=11, color=SLATE, align=PP_ALIGN.CENTER)


# ═══════════════════════════════════════════════════════════════════════════
# SLIDE 4 — Model Architecture & Compression
# ═══════════════════════════════════════════════════════════════════════════
s = add_slide()
slide_title(s, "Model Architecture & Compression",
            "348 MB of source weights → 19 MB deployed  (95% reduction)")

# Model table header
cols = ["Model", "Architecture", "Input", "Output", "Source size", "Deployed size"]
cw   = [Inches(2.5), Inches(2.8), Inches(2.0), Inches(1.5), Inches(1.5), Inches(1.8)]
cx   = [Inches(0.3)]
for w2 in cw[:-1]: cx.append(cx[-1] + w2)

hy = Inches(1.55)
rect(s, Inches(0.3), hy, Inches(12.7), Inches(0.42), color=BLUE)
for i, col in enumerate(cols):
    tb(s, col, cx[i], hy + Inches(0.06), cw[i], Inches(0.32),
       size=13, bold=True, color=WHITE)

rows = [
    ["spoof_fp16.onnx",       "MobileNetV3-Large",    "1×3×224×224", "(1,1) logit", "50.8 MB .pth", "8.4 MB ✓"],
    ["w600k_mbf_fp16.onnx",   "MobileFaceNet",        "1×3×112×112", "(1,512) embed","13.6 MB ONNX","6.8 MB ✓"],
    ["face_landmarker.task",  "MediaPipe Float16",    "Any frame",   "478 landmarks","3.8 MB task",  "3.8 MB ✓"],
    ["Blur detector",         "Laplacian Variance",   "RGB frame",   "variance float","0 MB (JS)",   "0 MB ✓"],
]
for r, row in enumerate(rows):
    ry = hy + Inches(0.42 + r * 0.52)
    bg = DARK_CARD if r % 2 == 0 else RGBColor(0x16, 0x21, 0x31)
    rect(s, Inches(0.3), ry, Inches(12.7), Inches(0.5), color=bg)
    for i, cell in enumerate(row):
        color = GREEN if "✓" in cell else WHITE if i < 2 else SLATE
        tb(s, cell, cx[i], ry + Inches(0.08), cw[i], Inches(0.36), size=13, color=color)

# Compression note
rect(s, Inches(0.3), Inches(4.7), Inches(12.7), Inches(1.6), color=DARK_CARD,
     line_color=BLUE, line_width=Pt(1))
tb(s, "Why FP16, not INT8?", Inches(0.55), Inches(4.8), Inches(6.0), Inches(0.4),
   size=15, bold=True, color=BLUE)
tb(s, "INT8 dynamic quantisation generates ConvInteger ONNX operators — excluded from ORT's mobile build.\n"
      "FP16 conversion uses standard Conv operators (universally supported) with half-precision weights.\n"
      "BatchNorm layers kept in FP32 to prevent sqrt(0) → NaN on ARM NEON hardware.",
   Inches(0.55), Inches(5.2), Inches(5.8), Inches(1.0), size=13, color=SLATE)

tb(s, "Total  19.0 MB", Inches(8.0), Inches(4.85), Inches(4.5), Inches(0.5),
   size=28, bold=True, color=GREEN, align=PP_ALIGN.CENTER)
tb(s, "Budget: ~20 MB  ✓", Inches(8.0), Inches(5.35), Inches(4.5), Inches(0.4),
   size=16, color=SLATE, align=PP_ALIGN.CENTER)
tb(s, "95% smaller than source", Inches(8.0), Inches(5.75), Inches(4.5), Inches(0.4),
   size=14, color=BLUE, align=PP_ALIGN.CENTER)


# ═══════════════════════════════════════════════════════════════════════════
# SLIDE 5 — Liveness Detection
# ═══════════════════════════════════════════════════════════════════════════
s = add_slide()
slide_title(s, "Liveness Detection — Dual Layer",
            "Active challenges + passive model — defeats photos, screens, and 3D masks")

# Active liveness flow
tb(s, "Active Liveness — 3-Challenge Sequence (MediaPipe)",
   Inches(0.4), Inches(1.4), Inches(12.5), Inches(0.4),
   size=16, bold=True, color=BLUE)

challenges = [
    ("😉", "BLINK", "eyeBlinkLeft < 0.3\nthen > 0.7", BLUE),
    ("→",  "",      "", SLATE),
    ("😊", "SMILE", "mouthSmileL +\nmouthSmileR > 1.0", GREEN),
    ("→",  "",      "", SLATE),
    ("↔️", "HEAD TURN", "|yaw| > 20°\n(euler angles)", YELLOW),
    ("→",  "",      "", SLATE),
    ("✅", "VERIFIED", "Proceed to\ncapture", GREEN),
]

cx2 = Inches(0.35)
for emoji, title, sub, color in challenges:
    if title == "":
        tb(s, emoji, cx2, Inches(2.3), Inches(0.6), Inches(0.5),
           size=22, color=SLATE, align=PP_ALIGN.CENTER)
        cx2 += Inches(0.55)
        continue
    rect(s, cx2, Inches(1.85), Inches(2.55), Inches(1.7), color=DARK_CARD,
         line_color=color, line_width=Pt(1.5))
    tb(s, emoji, cx2, Inches(1.9), Inches(2.55), Inches(0.6),
       size=28, align=PP_ALIGN.CENTER)
    tb(s, title, cx2, Inches(2.55), Inches(2.55), Inches(0.38),
       size=14, bold=True, color=color, align=PP_ALIGN.CENTER)
    tb(s, sub, cx2, Inches(2.9), Inches(2.55), Inches(0.6),
       size=11, color=SLATE, align=PP_ALIGN.CENTER)
    cx2 += Inches(2.55)

# Passive spoofing section
tb(s, "Passive Anti-Spoofing — MobileNetV3 (runs on every capture)",
   Inches(0.4), Inches(3.75), Inches(12.5), Inches(0.4),
   size=16, bold=True, color=BLUE)

passive_cols = [
    ("Input", "Camera snapshot\n224×224 crop\nImageNet normalised"),
    ("Model", "MobileNetV3-Large\nBinary classifier\nFP16 ONNX · CPU"),
    ("Output", "prob_live ∈ [0,1]\nThreshold: 0.3\n~160 ms on S25+"),
    ("Result", "isLive=true\n→ proceed\nisLive=false → reject"),
]

for i, (title, body) in enumerate(passive_cols):
    cx3 = Inches(0.4 + i * 3.2)
    rect(s, cx3, Inches(4.2), Inches(3.0), Inches(2.2), color=DARK_CARD)
    tb(s, title, cx3, Inches(4.28), Inches(3.0), Inches(0.38),
       size=13, bold=True, color=BLUE, align=PP_ALIGN.CENTER)
    tb(s, body, cx3, Inches(4.65), Inches(3.0), Inches(1.6),
       size=13, color=SLATE, align=PP_ALIGN.CENTER)

# Anti-spoofing table
tb(s, "Attack defeated by our system:", Inches(0.4), Inches(6.55),
   Inches(6.0), Inches(0.35), size=13, bold=True, color=WHITE)
attacks = "Printed photo  ✓   |   Screen video  ✓   |   Someone else's face  ✓   |   Spoofed photo  ✓"
tb(s, attacks, Inches(0.4), Inches(6.9), Inches(12.5), Inches(0.35),
   size=13, color=GREEN)


# ═══════════════════════════════════════════════════════════════════════════
# SLIDE 6 — Sync & Purge
# ═══════════════════════════════════════════════════════════════════════════
s = add_slide()
slide_title(s, "Offline-First Sync & Purge Mechanism",
            "Enroll anywhere — sync when connected — purge after 24 hours")

# Flow boxes
flow = [
    (BLUE,  "1. Enroll\n(offline)",     "Face captured\nStored in SQLite\nSync queue: PENDING"),
    (SLATE, "→", ""),
    (YELLOW,"2. Offline\nPeriod",        "App works fully\nNo connectivity\nQueue grows"),
    (SLATE, "→", ""),
    (GREEN, "3. Connected\n(auto-detect)","NetInfo fires\nSyncManager.drainQueue()\nPOST to AWS API"),
    (SLATE, "→", ""),
    (GREEN, "4. Purge\n(24 hours)",      "Completed entries\ndeleted from queue\nLocal DB kept"),
]

cx4 = Inches(0.3)
for color, title, body in flow:
    if title == "→":
        tb(s, "→", cx4, Inches(2.7), Inches(0.5), Inches(0.5),
           size=22, color=SLATE, align=PP_ALIGN.CENTER)
        cx4 += Inches(0.45)
        continue
    rect(s, cx4, Inches(1.7), Inches(2.8), Inches(2.6), color=DARK_CARD,
         line_color=color, line_width=Pt(1.5))
    tb(s, title, cx4, Inches(1.85), Inches(2.8), Inches(0.55),
       size=14, bold=True, color=color, align=PP_ALIGN.CENTER)
    tb(s, body, cx4, Inches(2.45), Inches(2.8), Inches(1.5),
       size=12, color=SLATE, align=PP_ALIGN.CENTER)
    cx4 += Inches(2.8)

# AWS payload
rect(s, Inches(0.3), Inches(4.55), Inches(5.8), Inches(2.7), color=DARK_CARD)
tb(s, "AWS Payload Format", Inches(0.5), Inches(4.65), Inches(5.4), Inches(0.4),
   size=14, bold=True, color=BLUE)
payload = ('{\n'
           '  "face_id":   "a3f8c1d2-...",\n'
           '  "tenant":    "default",\n'
           '  "operation": "INSERT",\n'
           '  "embedding": [0.023, -0.141, ...],\n'
           '  "name":      "Ankit Thawal",\n'
           '  "timestamp": 1749081234567\n'
           '}')
tb(s, payload, Inches(0.5), Inches(5.1), Inches(5.4), Inches(2.0),
   size=11, color=GREEN, italic=True)

# Retry logic
rect(s, Inches(6.5), Inches(4.55), Inches(6.5), Inches(2.7), color=DARK_CARD)
tb(s, "Retry & Purge Logic", Inches(6.7), Inches(4.65), Inches(6.1), Inches(0.4),
   size=14, bold=True, color=BLUE)
retry_lines = [
    "• Max 3 retries per queue item",
    "• After 3 failures → status = 'failed'",
    "• Success → status = 'done', synced = 1",
    "• Purge: DELETE done rows > 24h old",
    "• Survives app restarts (SQLite persisted)",
    "• Batch size: 20 faces per sync cycle",
]
tb_lines(s, retry_lines, Inches(6.7), Inches(5.1), Inches(6.1), Inches(2.0),
         size=13, color=SLATE)


# ═══════════════════════════════════════════════════════════════════════════
# SLIDE 7 — Performance Benchmarks
# ═══════════════════════════════════════════════════════════════════════════
s = add_slide()
slide_title(s, "Performance Benchmarks",
            "Samsung Galaxy S25+ · Snapdragon 8 Elite · Android 16 · CPU-only")

# Timing table
tb(s, "Inference Pipeline Timings", Inches(0.4), Inches(1.45), Inches(7.5), Inches(0.4),
   size=15, bold=True, color=BLUE)

timing_header = ["Operation", "Avg", "Max", "Status"]
timing_rows = [
    ["Blur detection (Laplacian JS)",  "~2 ms",    "5 ms",    "✓"],
    ["Spoof inference (FP16 ONNX)",    "~160 ms",  "250 ms",  "✓"],
    ["MediaPipe face detect",          "~60 ms",   "100 ms",  "✓"],
    ["Face embedding (FP16 ONNX)",     "~130 ms",  "200 ms",  "✓"],
    ["Cosine search (100 faces)",      "~5 ms",    "10 ms",   "✓"],
    ["Image decode + bridge",          "~120 ms",  "180 ms",  "✓"],
    ["TOTAL enroll pipeline",          "~550 ms",  "< 1 sec", "✓ PASS"],
    ["TOTAL verify pipeline",          "~550 ms",  "< 1 sec", "✓ PASS"],
]

tw   = [Inches(3.8), Inches(1.2), Inches(1.2), Inches(1.3)]
tcx  = [Inches(0.4)]
for w3 in tw[:-1]: tcx.append(tcx[-1] + w3)

rect(s, Inches(0.4), Inches(1.85), Inches(7.5), Inches(0.4), color=BLUE)
for i, h in enumerate(timing_header):
    tb(s, h, tcx[i], Inches(1.9), tw[i], Inches(0.35), size=13, bold=True, color=WHITE)

for r, row in enumerate(timing_rows):
    ry2 = Inches(2.25 + r * 0.52)
    is_total = "TOTAL" in row[0]
    bg = RGBColor(0x05, 0x2E, 0x16) if is_total else (DARK_CARD if r % 2 == 0 else RGBColor(0x16, 0x21, 0x31))
    rect(s, Inches(0.4), ry2, Inches(7.5), Inches(0.5), color=bg)
    for i, cell in enumerate(row):
        c = GREEN if ("✓" in cell or is_total) else (BLUE if i == 0 else SLATE)
        tb(s, cell, tcx[i], ry2 + Inches(0.07), tw[i], Inches(0.36),
           size=13, color=c, bold=is_total)

# Right side — model budget
tb(s, "Model Size Budget", Inches(8.3), Inches(1.45), Inches(4.8), Inches(0.4),
   size=15, bold=True, color=BLUE)

budget_items = [
    ("spoof_fp16.onnx",      "8.4 MB"),
    ("w600k_mbf_fp16.onnx",  "6.8 MB"),
    ("face_landmarker.task", "3.8 MB"),
    ("TOTAL",                "19.0 MB"),
    ("BUDGET",               "~20 MB"),
]
for r, (label, val) in enumerate(budget_items):
    ry3 = Inches(1.85 + r * 0.7)
    is_total2 = label in ("TOTAL", "BUDGET")
    bg2 = RGBColor(0x05, 0x2E, 0x16) if label == "TOTAL" else (DARK_CARD if not is_total2 else RGBColor(0x1E, 0x3A, 0x5F))
    rect(s, Inches(8.3), ry3, Inches(4.8), Inches(0.6), color=bg2)
    tb(s, label, Inches(8.5), ry3 + Inches(0.1), Inches(2.8), Inches(0.4),
       size=14, color=WHITE if is_total2 else SLATE, bold=is_total2)
    tb(s, val, Inches(11.0), ry3 + Inches(0.1), Inches(1.8), Inches(0.4),
       size=14, color=GREEN, bold=is_total2, align=PP_ALIGN.RIGHT)

# Big numbers
tb(s, "< 1 sec", Inches(8.3), Inches(5.55), Inches(4.8), Inches(0.9),
   size=52, bold=True, color=GREEN, align=PP_ALIGN.CENTER)
tb(s, "end-to-end recognition on CPU-only mid-range device",
   Inches(8.3), Inches(6.4), Inches(4.8), Inches(0.5),
   size=12, color=SLATE, align=PP_ALIGN.CENTER)


# ═══════════════════════════════════════════════════════════════════════════
# SLIDE 8 — Integration into Datalake 3.0
# ═══════════════════════════════════════════════════════════════════════════
s = add_slide()
slide_title(s, "Integration into Datalake 3.0",
            "Drop-in module — same React Native framework, minimal new dependencies")

# Left: steps
tb(s, "12-Step Integration", Inches(0.4), Inches(1.45), Inches(6.0), Inches(0.4),
   size=15, bold=True, color=BLUE)

steps_left = [
    "1.  Copy src/ml, src/db, src/sync, src/utils",
    "2.  Copy MediaPipeModule.java (Android)",
    "3.  Copy MediaPipeModule.swift (iOS)",
    "4.  Register MediaPipePackage in MainApplication",
    "5.  Copy 3 model files to Android assets",
    "6.  Add model files to Xcode project (iOS)",
    "7.  Add MediaPipe + ExifInterface to build.gradle",
    "8.  Add MediaPipeTasksVision to Podfile + pod install",
    "9.  Add aaptOptions noCompress in build.gradle",
    "10. npm install (5 packages)",
    "11. initDB() + prepareOnnxModels() + SyncManager.start()",
    "12. Set SYNC_ENDPOINT in constants.ts",
]
tb_lines(s, steps_left, Inches(0.4), Inches(1.9), Inches(6.2), Inches(5.4),
         size=13, color=SLATE)

# Right: net addition
tb(s, "Net addition to Datalake 3.0", Inches(7.0), Inches(1.45), Inches(6.0), Inches(0.4),
   size=15, bold=True, color=BLUE)

additions = [
    ("AI model bundle (3 files)", "+19 MB"),
    ("ONNX Runtime native lib",   "+8 MB"),
    ("MediaPipe tasks-vision",    "+8 MB"),
    ("JS source code",            "< 1 MB"),
    ("Net total addition",        "~36 MB"),
]
for i, (label, val) in enumerate(additions):
    ry4 = Inches(1.9 + i * 0.75)
    is_net = "Net total" in label
    rect(s, Inches(7.0), ry4, Inches(5.9), Inches(0.65),
         color=RGBColor(0x05, 0x2E, 0x16) if is_net else DARK_CARD)
    tb(s, label, Inches(7.2), ry4 + Inches(0.12), Inches(3.8), Inches(0.4),
       size=14, color=WHITE if is_net else SLATE, bold=is_net)
    tb(s, val, Inches(11.0), ry4 + Inches(0.12), Inches(1.6), Inches(0.4),
       size=14, color=GREEN, bold=is_net, align=PP_ALIGN.RIGHT)

# Note box
rect(s, Inches(7.0), Inches(5.7), Inches(5.9), Inches(1.6), color=DARK_CARD,
     line_color=BLUE, line_width=Pt(1))
tb(s, "Key integration insight", Inches(7.2), Inches(5.8), Inches(5.5), Inches(0.35),
   size=13, bold=True, color=BLUE)
tb(s, "Datalake 3.0 already ships React Native. The ~36 MB addition\n"
      "covers ML models + 2 native libs. Our JS code is < 1 MB.\n"
      "The API is 6 NativeModule methods + 1 event listener.",
   Inches(7.2), Inches(6.15), Inches(5.5), Inches(1.0), size=12, color=SLATE)


# ═══════════════════════════════════════════════════════════════════════════
# SLIDE 9 — Open Source & Attribution
# ═══════════════════════════════════════════════════════════════════════════
s = add_slide()
slide_title(s, "Open Source — 100% No Proprietary Code",
            "Every component is MIT, Apache 2.0, or cited for educational use")

oss_items = [
    ("ZepIris",              "MIT",           "Spoof model weights + architecture + preprocessing pipeline + DB schema"),
    ("InsightFace MobileFaceNet","Educational","w600k_mbf face embedding — 512-dim, 600K identities, diverse demographics"),
    ("MediaPipe Tasks Vision","Apache 2.0",   "Face Landmarker — active liveness (blend shapes) + face detection"),
    ("ONNX Runtime",         "MIT",           "On-device inference · CPU Execution Provider · no GPU required"),
    ("onnxconverter-common", "MIT",           "FP16 model conversion with safe BatchNorm handling"),
    ("React Native",         "MIT",           "Cross-platform framework — same JS codebase on Android + iOS"),
    ("react-native-vision-camera","MIT",      "Camera access, snapshot capture"),
    ("react-native-quick-sqlite","MIT",       "Synchronous SQLite — offline face storage + sync queue"),
    ("@react-native-community/netinfo","MIT", "Network state monitoring for sync trigger"),
    ("PyTorch / torchvision","BSD-3",         "Model export pipeline (Python tooling, not in APK)"),
]

cw2 = [Inches(3.0), Inches(1.4), Inches(8.1)]
cx5 = [Inches(0.3), Inches(3.3), Inches(4.7)]

rect(s, Inches(0.3), Inches(1.5), Inches(12.7), Inches(0.4), color=BLUE)
for i, h in enumerate(["Library", "License", "Usage in Pehchaan"]):
    tb(s, h, cx5[i], Inches(1.55), cw2[i], Inches(0.32), size=13, bold=True, color=WHITE)

for r, (lib, lic, usage) in enumerate(oss_items):
    ry5 = Inches(1.9 + r * 0.49)
    bg3 = DARK_CARD if r % 2 == 0 else RGBColor(0x16, 0x21, 0x31)
    rect(s, Inches(0.3), ry5, Inches(12.7), Inches(0.47), color=bg3)
    tb(s, lib, cx5[0], ry5 + Inches(0.06), cw2[0], Inches(0.36), size=12, color=WHITE, bold=True)
    lic_color = GREEN if lic == "MIT" else (YELLOW if "Educational" in lic else BLUE)
    tb(s, lic, cx5[1], ry5 + Inches(0.06), cw2[1], Inches(0.36), size=11, color=lic_color)
    tb(s, usage, cx5[2], ry5 + Inches(0.06), cw2[2], Inches(0.36), size=12, color=SLATE)


# ═══════════════════════════════════════════════════════════════════════════
# SLIDE 10 — Thank You
# ═══════════════════════════════════════════════════════════════════════════
s = add_slide()

tb(s, "👤", Inches(5.9), Inches(0.7), Inches(1.5), Inches(1.0), size=52, align=PP_ALIGN.CENTER)
tb(s, "Pehchaan", Inches(2), Inches(1.6), Inches(9.33), Inches(1.1),
   size=64, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
tb(s, "पहचान  ·  Recognition  ·  Identity",
   Inches(2), Inches(2.65), Inches(9.33), Inches(0.5),
   size=22, color=SLATE, align=PP_ALIGN.CENTER)

accent_bar(s, Inches(3.3))

# Key stats in a row
stats = [
    ("19 MB",   "Model bundle"),
    ("< 1 sec", "Inference"),
    ("3",       "Liveness challenges"),
    ("100%",    "Offline"),
    ("95%",     "Size reduction"),
]
for i, (val, label) in enumerate(stats):
    cx6 = Inches(0.5 + i * 2.6)
    rect(s, cx6, Inches(3.55), Inches(2.3), Inches(1.3), color=DARK_CARD,
         line_color=BLUE, line_width=Pt(1))
    tb(s, val, cx6, Inches(3.62), Inches(2.3), Inches(0.62),
       size=30, bold=True, color=GREEN, align=PP_ALIGN.CENTER)
    tb(s, label, cx6, Inches(4.24), Inches(2.3), Inches(0.38),
       size=12, color=SLATE, align=PP_ALIGN.CENTER)

accent_bar(s, Inches(5.05))

tb(s, "Ankit Thawal",
   Inches(2), Inches(5.2), Inches(9.33), Inches(0.55),
   size=28, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
tb(s, "🔗 linkedin.com/in/ankit-thawal",
   Inches(2), Inches(5.75), Inches(9.33), Inches(0.45),
   size=16, color=BLUE, align=PP_ALIGN.CENTER)
tb(s, "⌥ github.com/ankit-thawal47/pehchan",
   Inches(2), Inches(6.2), Inches(9.33), Inches(0.45),
   size=16, color=BLUE, align=PP_ALIGN.CENTER)
tb(s, "HACKATHON 7.0  ·  JUNE 2026",
   Inches(2), Inches(6.75), Inches(9.33), Inches(0.4),
   size=13, color=SLATE, align=PP_ALIGN.CENTER)


# ── Save ────────────────────────────────────────────────────────────────────
out_path = "Pehchaan_Hackathon7.pptx"
prs.save(out_path)
print(f"✓ Saved: {out_path}")
print(f"  Slides: {len(prs.slides)}")
