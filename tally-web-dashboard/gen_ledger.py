#!/usr/bin/env python3
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
import os, sys

output = r"C:\Users\Admin\ledger_Bhoparam.pdf"
doc = SimpleDocTemplate(output, pagesize=A4,
    topMargin=12*mm, bottomMargin=10*mm, leftMargin=10*mm, rightMargin=10*mm)

NAVY = colors.HexColor("#1B2A4A")
GOLD = colors.HexColor("#C9A84C")
LG = colors.HexColor("#F5ECD7")
LN = colors.HexColor("#E8EDF5")
GREY = colors.HexColor("#555")

E = []

# HEADER
hdr = Table([
    [Paragraph("<b>LEDGER ACCOUNT</b>", ParagraphStyle('h1', fontSize=16, textColor=GOLD, alignment=TA_CENTER, fontName='Helvetica-Bold'))],
    [Paragraph("<b>BHOPARAM JI NIMBAWAS</b>", ParagraphStyle('c', fontSize=12, textColor=colors.white, alignment=TA_CENTER, fontName='Helvetica-Bold'))],
    [Paragraph("Debtor Nimbavas | 01-Apr-2025 to 24-Jan-2026", ParagraphStyle('a', fontSize=8, textColor=colors.white, alignment=TA_CENTER))]
], colWidths=[190*mm])
hdr.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),NAVY),('ALIGN',(0,0),(-1,-1),'CENTER'),
    ('TOPPADDING',(0,0),(-1,0),8),('BOTTOMPADDING',(0,2),(-1,2),6),('BOX',(0,0),(-1,-1),0.5,NAVY)]))
E.append(hdr)
E.append(Spacer(1,4*mm))

# OB
ob = Table([
    [Paragraph("<b>Opening Balance:</b>", ParagraphStyle('ob', fontSize=9, textColor=NAVY)),
     Paragraph("", ParagraphStyle('ob', fontSize=9)),
     Paragraph("<b>\u20b94,67,616 Dr</b>", ParagraphStyle('ob', fontSize=9, textColor=NAVY, alignment=TA_RIGHT, fontName='Helvetica-Bold'))]
], colWidths=[76*mm,38*mm,76*mm])
ob.setStyle(TableStyle([('BOX',(0,0),(-1,-1),0.5,GOLD),('BACKGROUND',(0,0),(-1,-1),LG),
    ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
    ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8)]))
E.append(ob)
E.append(Spacer(1,3*mm))

# LEDGER TABLE
col_w = [22*mm,52*mm,30*mm,30*mm,22*mm,34*mm]
hdr_row = [Paragraph(f"<b>{h}</b>", ParagraphStyle('h', fontSize=8, textColor=colors.white, alignment=TA_CENTER))
           for h in ["Date","Vch Type","Debit (\u20b9)","Credit (\u20b9)","#","Balance (\u20b9)"]]

months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

# Transaction data
txns = [
    ["07-Apr-2025","Sales","50",32110,0],["07-Apr-2025","Receipt","87",0,30000],
    ["16-Apr-2025","Sales","163",11420,0],["19-Apr-2025","Sales","194",17940,0],
    ["20-Apr-2025","Receipt","234",0,30000],["21-Apr-2025","Sales","208",11100,0],
    ["23-Apr-2025","Sales","241",1940,0],["23-Apr-2025","Cr Note","5",0,4290],
    ["26-Apr-2025","Sales","278",6930,0],["28-Apr-2025","Sales","301",8720,0],
    ["04-May-2025","Receipt","363",0,30000],["07-May-2025","Sales","408",36365,0],
    ["16-May-2025","Sales","477",3500,0],["18-May-2025","Receipt","515",0,30000],
    ["19-May-2025","Sales","522",27690,0],["27-May-2025","Sales","607",9440,0],
    ["30-May-2025","Sales","635",7890,0],["01-Jun-2025","Receipt","637",0,35000],
    ["07-Jun-2025","Sales","716",27150,0],["14-Jun-2025","Sales","782",9800,0],
    ["14-Jun-2025","Sales","781",74780,0],["15-Jun-2025","Receipt","806",0,35000],
    ["29-Jun-2025","Receipt","956",0,35000],["05-Jul-2025","Sales","1061",9200,0],
    ["10-Jul-2025","Sales","1110",9180,0],["10-Jul-2025","Cr Note","37",0,720],
    ["11-Jul-2025","Sales","1113",930,0],["13-Jul-2025","Receipt","1098",0,15000],
    ["14-Jul-2025","Sales","1147",720,0],["26-Jul-2025","Receipt","1218",0,40000],
    ["29-Jul-2025","Sales","1316",17380,0],["02-Aug-2025","Sales","1358",11930,0],
    ["07-Aug-2025","Sales","1408",9060,0],["10-Aug-2025","Receipt","1342",0,30000],
    ["20-Aug-2025","Sales","1568",17060,0],["24-Aug-2025","Receipt","1471",0,20000],
    ["26-Aug-2025","Receipt","1531",0,10000],["04-Sep-2025","Sales","1681",7070,0],
    ["05-Sep-2025","Receipt","1606",0,30000],["08-Sep-2025","Sales","1706",52220,0],
    ["09-Sep-2025","Sales","1718",1420,0],["09-Sep-2025","Sales","1709",22250,0],
    ["17-Sep-2025","Sales","1797",5230,0],["25-Sep-2025","Sales","1913",7150,0],
    ["26-Sep-2025","Sales","1928",9170,0],["27-Sep-2025","Sales","1942",1200,0],
    ["04-Oct-2025","Sales","2007",1050,0],["04-Oct-2025","Sales","2019",40510,0],
    ["05-Oct-2025","Receipt","1874",0,15000],["11-Oct-2025","Sales","2103",1520,0],
    ["19-Oct-2025","Receipt","1995",0,35000],["23-Oct-2025","Sales","2258",33520,0],
    ["02-Nov-2025","Receipt","2159",0,35000],["06-Nov-2025","Sales","2397",10250,0],
    ["07-Nov-2025","Sales","2399",4360,0],["12-Nov-2025","Sales","2449",17940,0],
    ["21-Nov-2025","Cr Note","109",0,1080],["28-Nov-2025","Sales","2627",8960,0],
    ["29-Nov-2025","Receipt","2454",0,23000],["30-Nov-2025","Receipt","2457",0,7000],
    ["12-Dec-2025","Sales","2740",2670,0],["13-Dec-2025","Sales","2749",32230,0],
    ["22-Dec-2025","Sales","2822",11960,0],["23-Dec-2025","Sales","2827",9560,0],
    ["07-Jan-2026","Sales","2943",4060,0],["10-Jan-2026","Sales","2977",6880,0],
    ["11-Jan-2026","Receipt","2893",0,30000],["12-Jan-2026","Sales","3004",7100,0],
    ["13-Jan-2026","Sales","3011",54460,0],["24-Jan-2026","Sales","3143",3010,0],
]

rows = [hdr_row]
run = 467616
# OB row
rows.append([
    Paragraph("<i>01-Apr-2025</i>", ParagraphStyle('r', fontSize=7.5, textColor=GREY)),
    Paragraph("<i>Opening Balance</i>", ParagraphStyle('r', fontSize=7.5, textColor=GREY)),
    Paragraph("", ParagraphStyle('r', fontSize=7.5)),
    Paragraph("", ParagraphStyle('r', fontSize=7.5)),
    Paragraph("", ParagraphStyle('r', fontSize=7.5)),
    Paragraph("<b>4,67,616 Dr</b>", ParagraphStyle('r', fontSize=7.5, textColor=NAVY, fontName='Helvetica-Bold', alignment=TA_RIGHT)),
])

for d, vt, vn, dr, cr in txns:
    run += dr - cr
    rows.append([
        Paragraph(d, ParagraphStyle('r', fontSize=7)),
        Paragraph(vt, ParagraphStyle('r', fontSize=7)),
        Paragraph(f"{dr:,}" if dr else "", ParagraphStyle('r', fontSize=7, alignment=TA_RIGHT)),
        Paragraph(f"{cr:,}" if cr else "", ParagraphStyle('r', fontSize=7, alignment=TA_RIGHT)),
        Paragraph(f"#{vn}", ParagraphStyle('r', fontSize=7, textColor=GREY, alignment=TA_CENTER)),
        Paragraph(f"{run:,} Dr", ParagraphStyle('r', fontSize=7, alignment=TA_RIGHT)),
    ])

# Total + Closing
rows.append([
    Paragraph("<b>Total</b>", ParagraphStyle('r', fontSize=8, textColor=NAVY, fontName='Helvetica-Bold')),
    Paragraph("", ParagraphStyle('r', fontSize=8)),
    Paragraph("<b>7,17,985</b>", ParagraphStyle('r', fontSize=8, textColor=NAVY, fontName='Helvetica-Bold', alignment=TA_RIGHT)),
    Paragraph("<b>5,21,090</b>", ParagraphStyle('r', fontSize=8, textColor=NAVY, fontName='Helvetica-Bold', alignment=TA_RIGHT)),
    Paragraph("", ParagraphStyle('r', fontSize=8)),
    Paragraph("<b>2,70,721 Dr</b>", ParagraphStyle('r', fontSize=8, textColor=NAVY, fontName='Helvetica-Bold', alignment=TA_RIGHT)),
])

tbl = Table(rows, colWidths=col_w)
sty = [
    ('BACKGROUND',(0,0),(-1,0),NAVY),
    ('BOX',(0,0),(-1,-1),0.5,NAVY),
    ('INNERGRID',(0,0),(-1,-2),0.3,colors.HexColor("#CCC")),
    ('TOPPADDING',(0,1),(-1,-2),1.5),('BOTTOMPADDING',(0,1),(-1,-2),1.5),
    ('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),
    ('BACKGROUND',(0,-1),(-1,-1),LG),
    ('LINEABOVE',(0,-1),(-1,-1),0.5,GOLD),('LINEBELOW',(0,-1),(-1,-1),0.5,GOLD),
    ('BACKGROUND',(0,1),(-1,1),colors.HexColor("#F0F0F0")),
]
for i in range(2, len(rows)-1):
    if i % 2 == 0:
        sty.append(('BACKGROUND',(0,i),(-1,i),LN))
tbl.setStyle(TableStyle(sty))
E.append(tbl)
E.append(Spacer(1,4*mm))

# CLOSING
cb = Table([
    [Paragraph("<b>Closing Balance:</b>", ParagraphStyle('ob', fontSize=10, textColor=colors.white, fontName='Helvetica-Bold')),
     Paragraph("<b>\u20b92,70,721 Dr</b>", ParagraphStyle('ob', fontSize=10, textColor=GOLD, alignment=TA_RIGHT, fontName='Helvetica-Bold'))]
], colWidths=[95*mm,95*mm])
cb.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),NAVY),('TOPPADDING',(0,0),(-1,-1),6),
    ('BOTTOMPADDING',(0,0),(-1,-1),6),('LEFTPADDING',(0,0),(-1,-1),10),
    ('RIGHTPADDING',(0,0),(-1,-1),10),('BOX',(0,0),(-1,-1),0.5,NAVY)]))
E.append(cb)
E.append(Spacer(1,4*mm))

E.append(Table([
    [Paragraph("<i>This is a computer-generated statement from TallySync.</i>",
        ParagraphStyle('f', fontSize=7, textColor=colors.HexColor("#999"), alignment=TA_CENTER))]
], colWidths=[190*mm]))

doc.build(E)
print(f"OK: {output} ({os.path.getsize(output)} bytes)")
