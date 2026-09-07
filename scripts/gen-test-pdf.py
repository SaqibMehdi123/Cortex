from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm

c = canvas.Canvas('/home/z/my-project/uploads/test-book.pdf', pagesize=A4)
w, h = A4
PARAS = [
    "Reading on a phone used to mean exporting the file and hunting for a viewer.",
    "With a canvas-based renderer the same page geometry reaches every device.",
]
for p in range(1, 7):
    c.setFont('Helvetica-Bold', 22)
    c.drawString(2*cm, h-3*cm, f'Chapter {p} — Rendering Everywhere')
    c.setFont('Helvetica', 11)
    c.drawString(2*cm, h-4.2*cm, 'Cortex sample book · generated for the mobile PDF viewer test.')
    y = h - 5.4*cm
    for i in range(14):
        c.setFont('Helvetica', 10.5)
        c.drawString(2*cm, y, f'{p}.{i+1}  {PARAS[i % len(PARAS)]}')
        y -= 0.8*cm
        if y < 3*cm:
            break
    c.setFont('Helvetica-Oblique', 9)
    c.drawRightString(w-2*cm, 1.6*cm, f'page {p} of 6')
    c.showPage()
c.save()
print('PDF written')
