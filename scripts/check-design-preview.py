"""Validate design-preview.html: tag balance, key patterns, counts."""
from html.parser import HTMLParser
import sys, re

VOID = {"area","base","br","col","embed","hr","img","input","link","meta","source","track","wbr",
        "path","circle","rect","line","polyline","polygon","use","text"}  # svg self-closed ok

class Checker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errors, self.counts = [], [], {}
    def handle_starttag(self, tag, attrs):
        self.counts[tag] = self.counts.get(tag, 0) + 1
        if tag in VOID: return
        self.stack.append((tag, self.getpos()))
    def handle_startendtag(self, tag, attrs):
        self.counts[tag] = self.counts.get(tag, 0) + 1
    def handle_endtag(self, tag):
        if tag in VOID: return
        if not self.stack:
            self.errors.append(f"line {self.getpos()[0]}: closing </{tag}> with empty stack"); return
        if self.stack[-1][0] == tag:
            self.stack.pop(); return
        names = [t for t, _ in self.stack]
        if tag in names:
            while self.stack and self.stack[-1][0] != tag:
                bad = self.stack.pop()
                self.errors.append(f"line {self.getpos()[0]}: </{tag}> closes unclosed <{bad[0]}> opened at line {bad[1][0]}")
            self.stack.pop()
        else:
            self.errors.append(f"line {self.getpos()[0]}: stray closing </{tag}>")

src = open("/home/z/my-project/public/design-preview.html", encoding="utf-8").read()
c = Checker(); c.feed(src)
for tag, pos in c.stack:
    c.errors.append(f"unclosed <{tag}> opened at line {pos[0]}")

checks = [
    ("5 screens present", len(re.findall(r'class="screen"', src)) == 5),
    ("hash router present", "hashchange" in src),
    ("theme toggle present", "cortex-preview-theme" in src),
    ("in-card scroll (mscroll)", src.count('class="mscroll"') >= 4),
    ("accent pine #2f6b57", "#2f6b57" in src),
    ("dark accent #85b3a0", "#85b3a0" in src),
    ("Inter font loaded", "family=Inter" in src),
    ("Geist Mono loaded", "Geist+Mono" in src),
    ("kanban pane toggle", 'id="seg-lens"' in src and 'id="pane-kanban"' in src),
    ("kcard css defined", ".kcard{" in src),
    ("agent file chip", "Ayaan_CV_2026.pdf" in src),
    ("no emoji in code", not any(ch in src for ch in "🔥👋")),
]
fails = 0
print(f"parser errors: {len(c.errors)}")
for e in c.errors[:10]: print("  !!", e); fails += 1
for name, ok in checks:
    print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    if not ok: fails += 1
print(f"total tags: {sum(c.counts.values())} | sections: {c.counts.get('section',0)} | svg: {c.counts.get('svg',0)}")
sys.exit(1 if (fails or c.errors) else 0)
