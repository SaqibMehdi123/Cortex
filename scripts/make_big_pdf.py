#!/usr/bin/env python3
"""Build a large but fully valid multi-page PDF for upload testing.

Structure: a normal 12-page text document (so pdf-parse extracts real text)
plus one huge unreferenced padding stream that bulks the file past the old
30 MB upload limit. All xref offsets are computed correctly, so pdf.js and
pdf-parse open it like any other PDF.
"""
import os
import sys

TARGET_MB = float(sys.argv[1]) if len(sys.argv) > 1 else 40.0
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/z/my-project/scripts/test-big.pdf"
PAGES = 12


def esc(s: str) -> str:
    return s.replace("(", "").replace(")", "")


def build() -> bytes:
    objects: list[bytes] = []

    # 1: catalog, 2: pages, 3: font
    kids = " ".join(f"{4 + i * 2} 0 R" for i in range(PAGES))
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {PAGES} >>".encode())
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    for i in range(PAGES):
        lines = [
            f"Page {i + 1} line {l + 1}: Cortex large-file upload test. The quick brown fox jumps over the lazy dog."
            for l in range(40)
        ]
        content = "BT /F1 12 Tf 72 720 Td 16 TL\n" + "".join(
            f"({esc(t)}) Tj T*\n" for t in lines
        ) + "ET"
        cbytes = content.encode("latin1")
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {5 + i * 2} 0 R >>".encode()
        )
        objects.append(f"<< /Length {len(cbytes)} >>\nstream\n".encode() + cbytes + b"\nendstream")

    # Padding stream (unreferenced, pdf.js ignores it) to hit the target size
    base = sum(len(o) for o in objects) + 120 + 20 * (len(objects) + 1)
    pad_len = int(TARGET_MB * 1024 * 1024) - base - 64
    if pad_len > 0:
        pad = b"A" * pad_len
        objects.append(f"<< /Length {len(pad)} >>\nstream\n".encode() + pad + b"\nendstream")

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0] * (len(objects) + 1)
    for idx, obj in enumerate(objects, start=1):
        offsets[idx] = len(out)
        out += f"{idx} 0 obj\n".encode() + obj + b"\nendobj\n"

    xref_at = len(out)
    n = len(objects) + 1
    out += f"xref\n0 {n}\n".encode()
    out += b"0000000000 65535 f \n"
    for i in range(1, n):
        out += f"{offsets[i]:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    )
    return bytes(out)


data = build()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "wb") as f:
    f.write(data)
print(f"wrote {OUT}: {len(data) / 1024 / 1024:.1f} MB, {PAGES} pages")
