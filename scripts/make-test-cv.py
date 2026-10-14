#!/usr/bin/env python3
"""Generate a small text-based PDF CV for agent E2E tests (stdlib only)."""
import zlib

LINES = [
    "Sara Ahmed",
    "Islamabad, Pakistan | +92 300 1234567 | sara.ahmed@test.dev",
    "linkedin.com/in/saraahmed | github.com/saraahmed | saraahmed.dev",
    "",
    "Final-year Computer Science student at NUST, full-stack developer.",
    "Pakistani citizen - needs sponsorship for overseas roles.",
    "",
    "EXPERIENCE",
    "Software Engineer Intern - Test Startup, Lahore (Jun 2024 - Dec 2024)",
    "- Shipped the checkout flow used by 5,000 monthly users.",
    "- Cut API p95 latency 40% by adding Redis caching.",
    "",
    "Frontend Developer (Part-time) - Campus Labs (Feb 2024 - May 2024)",
    "- Built the events dashboard in Next.js and TypeScript.",
    "",
    "EDUCATION",
    "BS Computer Science, NUST (2022 - 2026), CGPA 3.7",
    "",
    "SKILLS",
    "TypeScript, Next.js, React, Python, PostgreSQL, Redis, Tailwind CSS, Prisma",
]

stream_lines = ["BT /F1 10 Tf 14 TL 50 780 Td"]
for line in LINES:
    safe = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    stream_lines.append(f"({safe}) Tj T*")
stream_lines.append("ET")
comp = zlib.compress(("\n".join(stream_lines)).encode("latin-1", "replace"))

objs = [
    b"<< /Type /Catalog /Pages 2 0 R >>",                # 1 catalog
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",        # 2 pages
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",  # 3 page
    b"<< /Length " + str(len(comp)).encode() + b" /Filter /FlateDecode >>\nstream\n" + comp + b"\nendstream",  # 4 content
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",  # 5 font
]

out = bytearray(b"%PDF-1.4\n")
offsets = [0]
for i, obj in enumerate(objs, 1):
    offsets.append(len(out))
    out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
xref_pos = len(out)
out += f"xref\n0 {len(objs)+1}\n".encode()
out += b"0000000000 65535 f \n"
for off in offsets[1:]:
    out += f"{off:010d} 00000 n \n".encode()
out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()

with open("/home/z/my-project/scripts/test-cv.pdf", "wb") as f:
    f.write(bytes(out))
print("wrote scripts/test-cv.pdf", len(out), "bytes")
