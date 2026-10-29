#!/usr/bin/env python3
"""Structural checks for design-preview.html (3-skin comparison page)."""
import re, sys
from html.parser import HTMLParser

PATH = "/home/z/my-project/public/design-preview.html"
VOID = {"area","base","br","col","embed","hr","img","input","link","meta","source","track","wbr","path","circle","rect","polyline","use","symbol"}

class Checker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errors = [], []
    def handle_starttag(self, tag, attrs):
        if tag not in VOID: self.stack.append(tag)
    def handle_endtag(self, tag):
        if tag in VOID: return
        if not self.stack: self.errors.append(f"stray </{tag}>"); return
        if self.stack[-1] == tag: self.stack.pop()
        else: self.errors.append(f"mismatch: got </{tag}>, open stack top <{self.stack[-1]}>")

html = open(PATH, encoding="utf-8").read()
p = Checker(); p.feed(html); p.close()
errs = list(p.errors)
if p.stack: errs.append(f"unclosed tags: {p.stack}")

must_have = ["id=\"dirA\"", "id=\"dirB\"", "id=\"dirC\"",
             "#i-shield", "i-shield\"", "Pick A", "Pick B", "Pick C",
             "toast", "scrollIntoView", "5e6ad2", "171717", "635bff",
             "data-pane=\"goals\"", "data-pane=\"plans\"", "data-pane=\"insights\"",
             "data-go=\"goals\"", "data-go=\"plans\"", "data-go=\"insights\"",
             "data-view=\"board\"", "data-expand", "class=\"kb\"", "cgr"]
for m in must_have:
    if m not in html: errs.append(f"missing: {m}")

ids = re.findall(r'id="(i-[a-z]+)"', html)
uses = set(re.findall(r'href="#(i-[a-z]+)"', html))
missing_sym = uses - set(ids)
if missing_sym: errs.append(f"icon uses without symbol: {missing_sym}")

if re.search(r'[\U0001F300-\U0001FAFF\u2705\u2728\u274C]', html): errs.append("emoji found")

if errs:
    print("FAIL"); [print(" -", e) for e in errs]; sys.exit(1)
print(f"PASS — tags balanced, 3 skins present, {len(ids)} symbols, all uses resolved")
