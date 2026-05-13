"""
UNALIGNED Board Training Guide
2-person operation: Sam (board) + Robert (posting)
Machine handles the middle. Robert gets a PDF brief at the end.
"""

import math
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon, Circle

OUTPUT = "/Users/asherweisberger/Desktop/UNALIGNED/UNALIGNED_Board_Training_Guide.pdf"

DARK        = colors.HexColor("#0d0f1c")
ACCENT      = colors.HexColor("#5b8cff")
GREEN       = colors.HexColor("#22c55e")
GREEN_LIGHT = colors.HexColor("#dcfce7")
AMBER       = colors.HexColor("#f59e0b")
AMBER_LIGHT = colors.HexColor("#fef9c3")
RED         = colors.HexColor("#ef4444")
RED_LIGHT   = colors.HexColor("#fee2e2")
PURPLE      = colors.HexColor("#a855f7")
PURPLE_LIGHT= colors.HexColor("#f3e8ff")
BLUE_LIGHT  = colors.HexColor("#dbeafe")
BLUE_MID    = colors.HexColor("#93c5fd")
TEAL        = colors.HexColor("#0891b2")
TEAL_LIGHT  = colors.HexColor("#cffafe")
GRAY_LIGHT  = colors.HexColor("#f3f4f6")
GRAY_MID    = colors.HexColor("#e5e7eb")
BORDER      = colors.HexColor("#d1d5db")
WHITE       = colors.white
MUTED       = colors.HexColor("#6b7280")
SAM_COLOR   = colors.HexColor("#0891b2")   # teal  = Sam
SAM_LIGHT   = colors.HexColor("#cffafe")
ROBERT_COLOR= colors.HexColor("#7c3aed")   # deep purple = Robert
ROBERT_LIGHT= colors.HexColor("#ede9fe")
MACHINE_COLOR=colors.HexColor("#374151")   # dark gray = Machine
MACHINE_LIGHT=colors.HexColor("#f3f4f6")
NAVY        = colors.HexColor("#1e3a5f")

doc = SimpleDocTemplate(
    OUTPUT, pagesize=letter,
    leftMargin=0.7*inch, rightMargin=0.7*inch,
    topMargin=0.6*inch,  bottomMargin=0.6*inch,
)
W = 7.1 * inch

def ps(name, size=13, leading=None, color=DARK, font='Helvetica',
       align=TA_LEFT, before=0, after=2):
    return ParagraphStyle(name, fontSize=size,
        leading=leading or round(size*1.45),
        textColor=color, fontName=font, alignment=align,
        spaceBefore=before, spaceAfter=after)

def sp(h=3):  return Spacer(1, h)

def section_bar(num, title, bg, fg=WHITE):
    p = Paragraph(f'<b>{num}.  {title}</b>',
                  ps('_sh', size=16, color=fg, font='Helvetica-Bold', leading=20))
    t = Table([[p]], colWidths=[W])
    t.setStyle(TableStyle([
        ('BACKGROUND',   (0,0),(-1,-1), bg),
        ('TOPPADDING',   (0,0),(-1,-1), 9),
        ('BOTTOMPADDING',(0,0),(-1,-1), 9),
        ('LEFTPADDING',  (0,0),(-1,-1), 14),
        ('RIGHTPADDING', (0,0),(-1,-1), 14),
    ]))
    return t

def key_point(text):
    t = Table([[Paragraph(f'<b>★  KEY POINT:  </b>{text}',
                ps('_kp', size=13, color=WHITE, leading=20))]], colWidths=[W])
    t.setStyle(TableStyle([
        ('BACKGROUND',   (0,0),(-1,-1), NAVY),
        ('BOX',          (0,0),(-1,-1), 2, ACCENT),
        ('TOPPADDING',   (0,0),(-1,-1), 10),
        ('BOTTOMPADDING',(0,0),(-1,-1), 10),
        ('LEFTPADDING',  (0,0),(-1,-1), 14),
        ('RIGHTPADDING', (0,0),(-1,-1), 14),
    ]))
    return t

def tip_box(text, bg=BLUE_LIGHT, border=ACCENT):
    t = Table([[Paragraph(f'💡  {text}',
                ps('_tip', size=12, color=DARK, leading=19))]], colWidths=[W])
    t.setStyle(TableStyle([
        ('BACKGROUND',   (0,0),(-1,-1), bg),
        ('BOX',          (0,0),(-1,-1), 1.2, border),
        ('TOPPADDING',   (0,0),(-1,-1), 8),
        ('BOTTOMPADDING',(0,0),(-1,-1), 8),
        ('LEFTPADDING',  (0,0),(-1,-1), 12),
        ('RIGHTPADDING', (0,0),(-1,-1), 12),
    ]))
    return t

def intro(text, size=13):
    return Paragraph(text, ps('_i', size=size, color=DARK, leading=20, after=4))

def rows_table(items, w1=1.65*inch):
    w2 = W - w1
    table_rows, style_cmds = [], [
        ('BOX',          (0,0),(-1,-1), 1.2, BORDER),
        ('INNERGRID',    (0,0),(-1,-1), 0.5, BORDER),
        ('TOPPADDING',   (0,0),(-1,-1), 7), ('BOTTOMPADDING',(0,0),(-1,-1), 7),
        ('LEFTPADDING',  (0,0),(-1,-1), 9), ('RIGHTPADDING', (0,0),(-1,-1), 9),
        ('VALIGN',       (0,0),(-1,-1), 'MIDDLE'),
    ]
    for i, (bg, border, label, desc) in enumerate(items):
        table_rows.append([
            Paragraph(f'<b>{label}</b>',
                      ps(f'l{i}', size=12, color=DARK, font='Helvetica-Bold',
                         align=TA_CENTER, leading=17)),
            Paragraph(desc, ps(f'd{i}', size=13, color=DARK, leading=19)),
        ])
        style_cmds += [('BACKGROUND',(0,i),(0,i),bg),('BACKGROUND',(1,i),(1,i),WHITE)]
    t = Table(table_rows, colWidths=[w1, w2])
    t.setStyle(TableStyle(style_cmds))
    return t

def section(num, title, bg, fg, items, callout=None, w1=1.65*inch):
    rows  = [x for x in items if isinstance(x, tuple)]
    texts = [x for x in items if isinstance(x, str)]
    blocks = [section_bar(num, title, bg, fg), sp(5)]
    for t in texts:
        blocks += [intro(t), sp(3)]
    if rows:
        blocks.append(rows_table(rows, w1=w1))
    if callout:
        blocks += [sp(5), callout]
    blocks.append(sp(8))
    return KeepTogether(blocks)

# ── CARD DIAGRAM ─────────────────────────────────────────────
def draw_arrow(d, x1, y1, x2, y2, clr):
    d.add(Line(x1,y1,x2,y2,strokeColor=clr,strokeWidth=1.4))
    a = math.atan2(y2-y1,x2-x1); s=7
    d.add(Polygon([x2,y2, x2-s*math.cos(a-.42),y2-s*math.sin(a-.42),
                   x2-s*math.cos(a+.42),y2-s*math.sin(a+.42)],
                  fillColor=clr,strokeColor=clr,strokeWidth=0))

def lbl_box(d, cx, cy, text, bg, border, w=122):
    d.add(Rect(cx-w/2,cy-10,w,20,rx=4,ry=4,fillColor=bg,strokeColor=border,strokeWidth=1.2))
    d.add(String(cx,cy-4,text,fontName='Helvetica-Bold',fontSize=9.5,
                 fillColor=DARK,textAnchor='middle'))

def card_diagram():
    DW,DH = 512,340
    d = Drawing(DW,DH)
    CX,CY,CW,CH = 108,110,298,168
    d.add(Rect(CX+3,CY-3,CW,CH,rx=8,ry=8,fillColor=colors.HexColor("#b0b3b8"),strokeColor=None))
    d.add(Rect(CX,CY,CW,CH,rx=8,ry=8,fillColor=colors.HexColor("#1a1d2e"),
               strokeColor=colors.HexColor("#2e3147"),strokeWidth=1.5))
    d.add(Rect(CX,CY,4,CH,rx=2,ry=2,fillColor=GREEN,strokeColor=None))
    d.add(String(CX+16,CY+CH-22,"Vedika Media",fontName='Helvetica-Bold',fontSize=14,fillColor=WHITE))
    d.add(String(CX+16,CY+CH-37,"PolyAI",fontName='Helvetica',fontSize=11,fillColor=colors.HexColor("#9ca3af")))
    d.add(String(CX+CW-10,CY+CH-22,"GMAIL",fontName='Helvetica',fontSize=10,fillColor=colors.HexColor("#9ca3af"),textAnchor='end'))
    d.add(String(CX+CW-10,CY+CH-35,"04/09/26",fontName='Helvetica',fontSize=10,fillColor=colors.HexColor("#9ca3af"),textAnchor='end'))
    TX,TY,TW,TH = CX+14,CY+CH-57,90,16
    d.add(Rect(TX,TY,TW,TH,rx=3,ry=3,fillColor=colors.HexColor("#1e2d5e"),strokeColor=None))
    d.add(String(TX+TW/2,TY+3,"SPONSORSHIP",fontName='Helvetica-Bold',fontSize=9,fillColor=ACCENT,textAnchor='middle'))
    d.add(String(CX+14,CY+CH-77,"Vedika from PolyAI confirmed Robert",fontName='Helvetica',fontSize=10,fillColor=colors.HexColor("#9ca3af")))
    d.add(String(CX+14,CY+CH-90,"for a paid campaign ($2,000)...",fontName='Helvetica',fontSize=10,fillColor=colors.HexColor("#9ca3af")))
    d.add(Line(CX+10,CY+32,CX+CW-10,CY+32,strokeColor=colors.HexColor("#2e3147"),strokeWidth=0.8))
    VX,VY,VW,VH = CX+14,CY+11,34,16
    d.add(Rect(VX,VY,VW,VH,rx=3,ry=3,fillColor=colors.HexColor("#0d2b1e"),strokeColor=None))
    d.add(String(VX+VW/2,VY+3,"$2k",fontName='Helvetica-Bold',fontSize=9,fillColor=GREEN,textAnchor='middle'))
    d.add(Circle(CX+CW-80,CY+20,5,fillColor=GREEN,strokeColor=None))
    BX,BY,BW,BH = CX+CW-68,CY+10,56,18
    d.add(Rect(BX,BY,BW,BH,rx=4,ry=4,fillColor=colors.HexColor("#0d2b1e"),strokeColor=colors.HexColor("#2e3147"),strokeWidth=1))
    d.add(String(BX+BW/2,BY+4,"✉ Reply",fontName='Helvetica-Bold',fontSize=9,fillColor=GREEN,textAnchor='middle'))
    lbl_box(d,52,CY+CH-25,"① Name & Company",BLUE_LIGHT,ACCENT)
    draw_arrow(d,113,CY+CH-25,CX+16,CY+CH-28,ACCENT)
    lbl_box(d,52,CY+CH-55,"② Deal Type Tag",AMBER_LIGHT,AMBER)
    draw_arrow(d,113,CY+CH-55,TX,TY+TH/2,AMBER)
    lbl_box(d,52,CY+CH-83,"③ Email Snippet",GRAY_LIGHT,MUTED)
    draw_arrow(d,113,CY+CH-83,CX+14,CY+CH-82,MUTED)
    lbl_box(d,52,CY+18,"④ Deal Value",GREEN_LIGHT,GREEN)
    draw_arrow(d,113,CY+18,VX,VY+VH/2,GREEN)
    lbl_box(d,DW-54,CY+CH-25,"⑤ Source & Date",TEAL_LIGHT,TEAL)
    draw_arrow(d,DW-115,CY+CH-25,CX+CW-10,CY+CH-25,TEAL)
    lbl_box(d,DW-54,CY+38,"⑥ New Reply!",GREEN_LIGHT,GREEN)
    draw_arrow(d,DW-115,CY+38,CX+CW-76,CY+20,GREEN)
    lbl_box(d,DW-54,CY+16,"⑦ Action Button",RED_LIGHT,RED)
    draw_arrow(d,DW-115,CY+16,BX+BW,BY+BH/2,RED)
    for i,(num,label,bg,border) in enumerate([
        ("①","Name & Company",BLUE_LIGHT,ACCENT),("②","Deal Type Tag",AMBER_LIGHT,AMBER),
        ("③","Email Snippet",GRAY_LIGHT,MUTED),("④","Deal Value",GREEN_LIGHT,GREEN),
        ("⑤","Source & Date",TEAL_LIGHT,TEAL),("⑥","New Reply Dot",GREEN_LIGHT,GREEN),
        ("⑦","Action Button",RED_LIGHT,RED),
    ]):
        col,rn = i%4,i//4
        bx,by = 18+col*126, 82-rn*22
        d.add(Rect(bx,by-9,17,17,rx=3,ry=3,fillColor=bg,strokeColor=border,strokeWidth=1))
        d.add(String(bx+8.5,by-4,num,fontName='Helvetica-Bold',fontSize=8.5,fillColor=DARK,textAnchor='middle'))
        d.add(String(bx+21,by-4,label,fontName='Helvetica',fontSize=9,fillColor=DARK,textAnchor='start'))
    return d

# ── 3-LAYER FLOW DIAGRAM ──────────────────────────────────────
def flow_diagram():
    DW, DH = 512, 165
    d = Drawing(DW, DH)
    # Boxes: y=55 (bottom) to y=145 (top), height=90
    BOX_Y, BOX_H, BOX_W = 55, 90, 130
    BOX_TOP  = BOX_Y + BOX_H   # 145
    ARROW_Y  = BOX_Y + BOX_H // 2  # 100  — mid of boxes
    LABEL_Y  = BOX_Y - 20          # 35   — below boxes, plenty of clearance

    box_data = [
        ( 10, MACHINE_COLOR, MACHINE_LIGHT, "THE MACHINE", "Scrapes emails, drafts\nreplies, moves cards"),
        (192, SAM_COLOR,     SAM_LIGHT,     "SAM",          "Reviews, approves,\nsends rates & invoices"),
        (374, ROBERT_COLOR,  ROBERT_LIGHT,  "ROBERT",       "Receives PDF brief,\nposts on X & LinkedIn"),
    ]

    for i, (x, bg, light, title, desc) in enumerate(box_data):
        d.add(Rect(x, BOX_Y, BOX_W, BOX_H, rx=8, ry=8, fillColor=light, strokeColor=bg, strokeWidth=2))
        d.add(String(x+BOX_W/2, BOX_TOP-14, title,
                     fontName='Helvetica-Bold', fontSize=12, fillColor=bg, textAnchor='middle'))
        for j, line in enumerate(desc.split('\n')):
            d.add(String(x+BOX_W/2, BOX_TOP-33-j*16, line,
                         fontName='Helvetica', fontSize=10, fillColor=DARK, textAnchor='middle'))
        d.add(Circle(x+14, BOX_TOP-10, 9, fillColor=bg, strokeColor=None))
        d.add(String(x+14, BOX_TOP-14, str(i+1),
                     fontName='Helvetica-Bold', fontSize=10, fillColor=WHITE, textAnchor='middle'))

    # Arrows and labels — gaps are x=140→192 and x=322→374 (52px each)
    arrow_data = [
        (140, 192, 166, "hands off to"),
        (322, 374, 348, "PDF brief →"),
    ]
    for x1, x2, lx, label in arrow_data:
        d.add(Line(x1+2, ARROW_Y, x2-4, ARROW_Y, strokeColor=MUTED, strokeWidth=2))
        d.add(Polygon([x2-4, ARROW_Y, x2-12, ARROW_Y+5, x2-12, ARROW_Y-5],
                      fillColor=MUTED, strokeColor=MUTED, strokeWidth=0))
        d.add(String(lx, LABEL_Y, label,
                     fontName='Helvetica-Oblique', fontSize=9, fillColor=MUTED, textAnchor='middle'))

    return d


# ════════════════════════════════════════════════════════════════
# STORY
# ════════════════════════════════════════════════════════════════
S = []

# ── COVER ────────────────────────────────────────────────────
S += [
    sp(16),
    Paragraph("UNALIGNED", ps('ct', size=42, leading=48, color=DARK,
              font='Helvetica-Bold', align=TA_CENTER, after=2)),
    Paragraph("Deal Pipeline — Training Guide",
              ps('cs', size=20, color=ACCENT, font='Helvetica-Bold', align=TA_CENTER, after=4)),
    HRFlowable(width="100%", thickness=2, color=BORDER, spaceAfter=6),
    # Role badges on cover
    Table([[
        Paragraph('<b>SAM</b>\nManages the board daily',
                  ps('rb1', size=13, color=WHITE, font='Helvetica-Bold', align=TA_CENTER, leading=19)),
        Paragraph('<b>+</b>', ps('pl', size=20, color=MUTED, align=TA_CENTER)),
        Paragraph('<b>ROBERT</b>\nReceives brief, posts content',
                  ps('rb2', size=13, color=WHITE, font='Helvetica-Bold', align=TA_CENTER, leading=19)),
    ]], colWidths=[3.0*inch, 0.6*inch, 3.5*inch],
    style=TableStyle([
        ('BACKGROUND',   (0,0),(0,0), SAM_COLOR),
        ('BACKGROUND',   (2,0),(2,0), ROBERT_COLOR),
        ('BACKGROUND',   (1,0),(1,0), WHITE),
        ('TOPPADDING',   (0,0),(-1,-1), 12), ('BOTTOMPADDING',(0,0),(-1,-1), 12),
        ('LEFTPADDING',  (0,0),(-1,-1), 10), ('RIGHTPADDING', (0,0),(-1,-1), 10),
        ('VALIGN',       (0,0),(-1,-1), 'MIDDLE'),
        ('ROUNDEDCORNERS', [8]),
    ])),
    sp(6),
    Paragraph("The machine handles the middle. This guide explains exactly who does what.",
              ps('cc', size=13, color=MUTED, font='Helvetica-Oblique', align=TA_CENTER, after=0)),
    sp(6),
    HRFlowable(width="100%", thickness=3, color=ACCENT, spaceAfter=0),
]

# ── 1. THE BIG PICTURE ───────────────────────────────────────
S.append(KeepTogether([
    section_bar("1", "The Big Picture — How This Works", ACCENT),
    sp(5),
    intro("Unaligned runs a 3-layer system. The machine does the heavy lifting. Sam manages the deals. Robert posts the content.", size=14),
    sp(5),
    flow_diagram(),
    sp(5),
    Table([[
        Paragraph(
            '<b>THE MACHINE</b> runs every night automatically. It reads all incoming emails, '
            'creates cards for new leads, drafts reply emails, and moves deals forward. '
            'It does NOT send anything without approval.',
            ps('ml', size=12, color=DARK, leading=19)),
    ]], colWidths=[W], style=TableStyle([
        ('BACKGROUND',   (0,0),(-1,-1), MACHINE_LIGHT),
        ('BOX',          (0,0),(-1,-1), 1.5, MACHINE_COLOR),
        ('TOPPADDING',   (0,0),(-1,-1), 8), ('BOTTOMPADDING',(0,0),(-1,-1), 8),
        ('LEFTPADDING',  (0,0),(-1,-1), 12), ('RIGHTPADDING',(0,0),(-1,-1), 12),
    ])),
    sp(3),
    Table([[
        Paragraph(
            '<b>SAM</b> works the board each morning. He reviews what the machine drafted, '
            'approves emails, sends rates to interested leads, and manages negotiations '
            'until a deal is closed and invoiced.',
            ps('sl', size=12, color=DARK, leading=19)),
    ]], colWidths=[W], style=TableStyle([
        ('BACKGROUND',   (0,0),(-1,-1), SAM_LIGHT),
        ('BOX',          (0,0),(-1,-1), 1.5, SAM_COLOR),
        ('TOPPADDING',   (0,0),(-1,-1), 8), ('BOTTOMPADDING',(0,0),(-1,-1), 8),
        ('LEFTPADDING',  (0,0),(-1,-1), 12), ('RIGHTPADDING',(0,0),(-1,-1), 12),
    ])),
    sp(3),
    Table([[
        Paragraph(
            '<b>ROBERT</b> has one job in this pipeline: post the content. When a deal is '
            'ready to go live, Robert receives a <b>PDF brief</b> with everything he needs '
            '— the client, the platform, the approved content, the date. '
            'He reads it, posts it, done.',
            ps('rl', size=12, color=DARK, leading=19)),
    ]], colWidths=[W], style=TableStyle([
        ('BACKGROUND',   (0,0),(-1,-1), ROBERT_LIGHT),
        ('BOX',          (0,0),(-1,-1), 1.5, ROBERT_COLOR),
        ('TOPPADDING',   (0,0),(-1,-1), 8), ('BOTTOMPADDING',(0,0),(-1,-1), 8),
        ('LEFTPADDING',  (0,0),(-1,-1), 12), ('RIGHTPADDING',(0,0),(-1,-1), 12),
    ])),
    sp(5),
    key_point("We are training the machine to take over more steps every month. "
              "The goal: Sam approves, Robert posts. Everything else is automated."),
    sp(8),
]))

# ── 2. THE COLUMNS ───────────────────────────────────────────
S.append(section("2", "The Deal Stages — Left to Right", TEAL, WHITE, [
    "Every deal starts on the left and moves right. The machine and Sam push cards forward. Robert only appears at the very end.",
    (GRAY_LIGHT,   GRAY_MID,    "NEW",           "Machine found a new lead. Nobody has reviewed it yet."),
    (BLUE_LIGHT,   BLUE_MID,    "FIRST TOUCH",   "We replied once. Robert sent a warm intro, looped in Sam."),
    (TEAL_LIGHT,   TEAL,        "ENGAGED",        "Active conversation. Sam is managing back and forth."),
    (AMBER_LIGHT,  AMBER,       "RATES SENT",    "Sam sent the pricing package. Waiting for their response."),
    (AMBER_LIGHT,  colors.HexColor("#d97706"), "NEGOTIATING", "They responded to rates. Sam is closing the deal."),
    (PURPLE_LIGHT, PURPLE,      "INVOICE SENT",  "Deal agreed. Invoice sent. Waiting on payment."),
    (GREEN_LIGHT,  GREEN,       "DONE",          "Robert posted. Content is live. Complete."),
    (GREEN_LIGHT,  colors.HexColor("#16a34a"), "PAID OUT", "Payment received. Closed."),
    (RED_LIGHT,    RED,         "DEAD LEADS",    "Ghosted or said no. Removed from active pipeline."),
], callout=tip_box(
    "Robert only touches deals at DONE — and only after receiving his PDF brief. "
    "Everything before that is Sam and the machine.",
    bg=ROBERT_LIGHT, border=ROBERT_COLOR
)))

# ── 3. CARD DIAGRAM ──────────────────────────────────────────
S.append(KeepTogether([
    section_bar("3", "Picture Guide — What Is On a Card?", colors.HexColor("#374151")),
    sp(5),
    intro("Sam works with these cards every day. Here is what every part means."),
    sp(4),
    card_diagram(),
    sp(5),
    key_point("Bottom-right corner is always the action. It tells Sam exactly what to do next."),
    sp(8),
]))

# ── 4. CARD PARTS ────────────────────────────────────────────
S.append(section("4", "What Each Part of the Card Means", TEAL, WHITE, [
    "Every card has the same layout. Here is each part explained:",
    (BLUE_LIGHT,   ACCENT,  "① Name & Company",  "The contact person's name and their company."),
    (TEAL_LIGHT,   TEAL,    "② Deal Type Tag",   "What they want — Sponsorship, Interview, Intro, etc."),
    (GRAY_LIGHT,   MUTED,   "③ Email Snippet",   "The last thing said in the email thread. A quick preview."),
    (AMBER_LIGHT,  AMBER,   "⑤ Source & Date",  "Where the email came from and when it arrived."),
    (GREEN_LIGHT,  GREEN,   "④ Deal Value",      "How much money this deal is worth."),
    (GREEN_LIGHT,  GREEN,   "⑥ Green Dot",       "<b>The lead replied and is waiting on us right now.</b>"),
    (RED_LIGHT,    RED,     "⑦ Action Button",   "Sam's next action. Always check bottom-right first."),
    (RED_LIGHT,    RED,     "Red Glow",           "Card is marked HOT. Handle today."),
]))

# ── 5. SAM'S BUTTONS ─────────────────────────────────────────
btn_rows, btn_style = [], [
    ('BOX',        (0,0),(-1,-1), 1.2, BORDER),
    ('INNERGRID',  (0,0),(-1,-1), 0.5, BORDER),
    ('TOPPADDING', (0,0),(-1,-1), 8), ('BOTTOMPADDING',(0,0),(-1,-1), 8),
    ('LEFTPADDING',(0,0),(-1,-1), 8), ('RIGHTPADDING', (0,0),(-1,-1), 8),
    ('VALIGN',     (0,0),(-1,-1), 'MIDDLE'),
]
for i, (btn_bg, row_bg, btn_fg, label, means, do) in enumerate([
    (GREEN,   GREEN_LIGHT,  WHITE,  "✉  REPLY",
     "Lead replied — waiting on Sam.",
     "Click to open. Write back or approve a machine draft."),
    (AMBER,   AMBER_LIGHT,  DARK,   "$  RATES",
     "Lead is engaged. No pricing sent yet.",
     "Click. Rates email opens pre-filled. Sam reviews and sends."),
    (GREEN,   GREEN_LIGHT,  WHITE,  "✅  APPROVE SAM",
     "Machine wrote a reply overnight.",
     "Sam reads it. If good, click Approve. Sends automatically."),
    (PURPLE,  PURPLE_LIGHT, WHITE,  "💰  INVOICE PAID",
     "Invoice is out. Waiting for payment.",
     "Click when payment arrives. Card moves to Paid Out."),
]):
    btn_rows.append([
        Paragraph(f'<b>{label}</b>',
                  ps(f'bl{i}',size=12,color=btn_fg,font='Helvetica-Bold',align=TA_CENTER,leading=17)),
        Paragraph(f'<b>Means:</b> {means}',
                  ps(f'bm{i}',size=12,color=DARK,leading=18,after=2)),
        Paragraph(f'<b>Do:</b> {do}',
                  ps(f'bd{i}',size=12,color=DARK,leading=18)),
    ])
    btn_style += [
        ('BACKGROUND',(0,i),(0,i),btn_bg),
        ('BACKGROUND',(1,i),(1,i),row_bg),
        ('BACKGROUND',(2,i),(2,i),WHITE),
    ]
btn_t = Table(btn_rows, colWidths=[1.4*inch, 2.4*inch, 3.3*inch])
btn_t.setStyle(TableStyle(btn_style))

S.append(KeepTogether([
    section_bar("5", "Sam's Action Buttons", SAM_COLOR),
    sp(5),
    intro("Sam sees one button per card. Read it, click it. The board tells Sam exactly what to do.", size=13),
    sp(4),
    btn_t,
    sp(5),
    key_point("Green pulsing dot = a real person is waiting on a reply RIGHT NOW. Sam handles these first, every morning."),
    sp(8),
]))

# ── 6. SAM'S DAILY WORKFLOW ──────────────────────────────────
step_rows, step_style = [], [
    ('BOX',        (0,0),(-1,-1), 1.2, BORDER),
    ('INNERGRID',  (0,0),(-1,-1), 0.5, BORDER),
    ('TOPPADDING', (0,0),(-1,-1), 8), ('BOTTOMPADDING',(0,0),(-1,-1), 8),
    ('LEFTPADDING',(0,0),(-1,-1), 9), ('RIGHTPADDING', (0,0),(-1,-1), 9),
    ('VALIGN',     (0,0),(-1,-1), 'MIDDLE'),
]
for i,(bg,border,step,action,detail) in enumerate([
    (RED_LIGHT,   RED,      "STEP 1 ★","Find green pulsing dots",
     "These leads replied. They are WAITING. Click Reply and respond first. Never skip this."),
    (GREEN_LIGHT, GREEN,    "STEP 2",  "Find Approve Sam buttons",
     "Machine drafted replies overnight. Sam reads each one. Looks good? Click Approve."),
    (AMBER_LIGHT, AMBER,    "STEP 3",  "Check Engaged column",
     "Anyone ready for pricing? Click $ Rates to send the rates email."),
    (BLUE_LIGHT,  ACCENT,   "STEP 4",  "Check Negotiating",
     "Any deals close to closing? Answer questions, confirm terms, push it forward."),
    (GRAY_LIGHT,  MUTED,    "STEP 5",  "Clean up dead leads",
     "Silent for weeks? Hover the card, click ✕ Dead. Keep the board clean."),
]):
    step_rows.append([
        Paragraph(f'<b>{step}</b>',
                  ps(f'sn{i}',size=11,color=DARK,font='Helvetica-Bold',align=TA_CENTER,leading=16)),
        Paragraph(f'<b>{action}</b>',
                  ps(f'sa{i}',size=13,color=DARK,font='Helvetica-Bold',leading=18)),
        Paragraph(detail, ps(f'sd{i}',size=12,color=DARK,leading=18)),
    ])
    step_style += [
        ('BACKGROUND',(0,i),(0,i),bg),
        ('BACKGROUND',(1,i),(1,i),WHITE),
        ('BACKGROUND',(2,i),(2,i),WHITE),
    ]
step_t = Table(step_rows, colWidths=[0.9*inch, 2.0*inch, 4.2*inch])
step_t.setStyle(TableStyle(step_style))

S.append(KeepTogether([
    section_bar("6", "Sam's Daily Workflow — 5 Steps Every Morning", SAM_COLOR),
    sp(5),
    intro("Sam does these 5 things every morning in order. Takes about 15 minutes.", size=13),
    sp(4),
    step_t,
    sp(5),
    key_point("Sam's entire job is to keep cards moving right. The machine sets things up. Sam closes deals."),
    sp(8),
]))

# ── 7. ROBERT'S STEP ─────────────────────────────────────────
S.append(KeepTogether([
    section_bar("7", "Robert's Step — The PDF Brief", ROBERT_COLOR),
    sp(5),
    intro(
        "Robert does <b>not</b> work the board. Robert has one job in this pipeline: "
        "<b>post the content.</b> When a deal is fully closed and ready to go live, "
        "Robert receives a <b>PDF brief</b> with everything he needs.",
        size=13
    ),
    sp(4),
    rows_table([
        (ROBERT_LIGHT, ROBERT_COLOR, "Who",      "The client's name, company, and what they paid for."),
        (ROBERT_LIGHT, ROBERT_COLOR, "What",     "The exact content to post — caption, copy, hashtags, any links."),
        (ROBERT_LIGHT, ROBERT_COLOR, "Where",    "Which platform — X (Twitter), LinkedIn, or both."),
        (ROBERT_LIGHT, ROBERT_COLOR, "When",     "The agreed posting date and time."),
        (ROBERT_LIGHT, ROBERT_COLOR, "Assets",   "Any images, videos, or files to attach to the post."),
        (ROBERT_LIGHT, ROBERT_COLOR, "Notes",    "Any special instructions — tagging the client, links to include, etc."),
    ], w1=1.1*inch),
    sp(5),
    Table([[
        Paragraph(
            '<b>Robert\'s process is simple:</b><br/>'
            '1.  Receive the PDF brief<br/>'
            '2.  Read it — everything is already written and approved<br/>'
            '3.  Post the content on the correct platform<br/>'
            '4.  Done — Sam marks the card complete',
            ps('rp', size=13, color=DARK, leading=22)),
    ]], colWidths=[W], style=TableStyle([
        ('BACKGROUND',   (0,0),(-1,-1), ROBERT_LIGHT),
        ('BOX',          (0,0),(-1,-1), 2, ROBERT_COLOR),
        ('TOPPADDING',   (0,0),(-1,-1), 10), ('BOTTOMPADDING',(0,0),(-1,-1), 10),
        ('LEFTPADDING',  (0,0),(-1,-1), 14), ('RIGHTPADDING', (0,0),(-1,-1), 14),
    ])),
    sp(5),
    key_point(
        "The PDF brief exists so Robert spends zero time on admin. "
        "Every piece of information is already in front of him. "
        "His only focus is the quality of the post."
    ),
    sp(8),
]))

# ── 8. OPENING A CARD (Sam) ──────────────────────────────────
S.append(section("8", "Opening a Card (Sam)", SAM_COLOR, WHITE, [
    "<b>Click anywhere on a card</b> to open it. Everything Sam needs is inside.",
    (BLUE_LIGHT,   ACCENT,  "Full Email",      "The whole conversation — every message in order."),
    (AMBER_LIGHT,  AMBER,   "Contact Info",    "Name, email, phone, company on the left side."),
    (GREEN_LIGHT,  GREEN,   "Email Composer",  "Write and send replies directly from here. Never need Gmail."),
    (PURPLE_LIGHT, PURPLE,  "Templates",       "Pre-written emails. Pick one and it fills in automatically."),
    (TEAL_LIGHT,   TEAL,    "AI Draft",        "Machine writes a reply for Sam to review and approve."),
], callout=tip_box(
    "Sam never needs to open Gmail. Every email is read and sent from inside this board.",
    bg=SAM_LIGHT, border=SAM_COLOR
)))

# ── 9. WHAT THE MACHINE DOES OVERNIGHT ───────────────────────
S.append(section("9", "What the Machine Does Overnight", MACHINE_COLOR, WHITE, [
    "Every night, the machine runs automatically while Sam and Robert sleep.",
    (MACHINE_LIGHT, MACHINE_COLOR, "Reads Gmail",    "Scans all incoming emails for new leads and replies."),
    (MACHINE_LIGHT, MACHINE_COLOR, "Creates Cards",  "New leads become cards on the board automatically."),
    (MACHINE_LIGHT, MACHINE_COLOR, "Writes Drafts",  "Drafts reply emails for Sam to review and approve."),
    (MACHINE_LIGHT, MACHINE_COLOR, "Flags Replies",  "Puts a green dot on every card where someone replied."),
    (MACHINE_LIGHT, MACHINE_COLOR, "Moves Cards",    "Advances cards through stages when the deal progresses."),
    (MACHINE_LIGHT, MACHINE_COLOR, "Logs Activity",  "Records everything — every move, every draft, every send."),
], callout=key_point(
    "The machine is getting smarter every month. The goal is for it to handle "
    "everything up to the moment Robert posts. Sam's role shrinks to approvals only."
)))

# ── 10. CHEAT SHEET ──────────────────────────────────────────
cheat_rows, cheat_style = [], [
    ('BOX',        (0,0),(-1,-1), 1.2, BORDER),
    ('INNERGRID',  (0,0),(-1,-1), 0.5, BORDER),
    ('TOPPADDING', (0,0),(-1,-1), 7), ('BOTTOMPADDING',(0,0),(-1,-1), 7),
    ('LEFTPADDING',(0,0),(-1,-1), 10), ('RIGHTPADDING',(0,0),(-1,-1), 10),
    ('VALIGN',     (0,0),(-1,-1), 'MIDDLE'),
]
for i,(bg,who,situation,answer) in enumerate([
    (RED_LIGHT,    "SAM",    "I see a green pulsing dot",       "Lead replied. Click ✉ Reply right now."),
    (GREEN_LIGHT,  "SAM",    "I see Approve Sam",               "Machine wrote a draft. Read it, click Approve."),
    (AMBER_LIGHT,  "SAM",    "I see $ Rates",                   "No pricing sent yet. Click to send it."),
    (PURPLE_LIGHT, "SAM",    "I see Invoice Paid",               "Payment arrived. Click to record it."),
    (RED_LIGHT,    "SAM",    "Card is glowing red",              "Marked HOT. Deal with it today."),
    (GRAY_LIGHT,   "SAM",    "Card has no button",               "Waiting on them. Nothing to do."),
    (GRAY_LIGHT,   "SAM",    "Someone stopped replying",         "Hover card. Click ✕ Dead. Move on."),
    (ROBERT_LIGHT, "ROBERT", "I received a PDF brief",           "Read it. Post the content on the right platform. Done."),
    (ROBERT_LIGHT, "ROBERT", "I have a question about the post", "Call or message Sam. Sam handles everything else."),
]):
    who_color = SAM_COLOR if who == "SAM" else ROBERT_COLOR
    cheat_rows.append([
        Paragraph(f'<b>{who}</b>',
                  ps(f'cw{i}',size=11,color=WHITE,font='Helvetica-Bold',align=TA_CENTER,leading=16)),
        Paragraph(f'<b>{situation}</b>',
                  ps(f'cs{i}',size=12,color=DARK,font='Helvetica-Bold',leading=18)),
        Paragraph(f'→  {answer}',
                  ps(f'ca{i}',size=12,color=DARK,leading=18)),
    ])
    cheat_style += [
        ('BACKGROUND',(0,i),(0,i),who_color),
        ('BACKGROUND',(1,i),(1,i),GRAY_LIGHT if who=='SAM' else ROBERT_LIGHT),
        ('BACKGROUND',(2,i),(2,i),WHITE),
    ]
cheat_t = Table(cheat_rows, colWidths=[0.7*inch, 2.9*inch, 3.5*inch])
cheat_t.setStyle(TableStyle(cheat_style))

S.append(KeepTogether([
    section_bar("10", "Cheat Sheet — Who Does What", DARK),
    sp(5),
    intro("TEAL = Sam's actions. PURPLE = Robert's actions."),
    sp(4),
    cheat_t,
    sp(10),
]))

doc.build(S)
print(f"✅  PDF → {OUTPUT}")
