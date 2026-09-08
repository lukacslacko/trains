#!/usr/bin/env python3
"""Checks the Books and their amendment slips: tag balance, slip anchors, edition lines."""
import re, sys, os
from html.parser import HTMLParser

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "manuals")
VOID = {"img", "br", "hr", "meta", "link", "input", "path", "circle", "rect", "line", "polyline", "polygon", "use", "ellipse", "stop"}

class Balance(HTMLParser):
    def __init__(self):
        super().__init__(); self.stack = []; self.errors = []
    def handle_starttag(self, tag, attrs):
        if tag not in VOID: self.stack.append(tag)
    def handle_startendtag(self, tag, attrs): pass
    def handle_endtag(self, tag):
        if tag in VOID: return
        if self.stack and self.stack[-1] == tag: self.stack.pop()
        else: self.errors.append(f"unexpected </{tag}> (open: {self.stack[-3:]})")

ok = True
def fail(msg):
    global ok; ok = False; print("FAIL", msg)

for letter in "irsd":
    book = os.path.join(ROOT, f"book-{letter}.html")
    s = open(book).read()
    b = Balance(); b.feed(s)
    if b.errors or b.stack: fail(f"book-{letter}: tags {b.errors[:2]} open={b.stack[:3]}")
    ids = set(re.findall(r'id="([^"]+)"', s))
    m = re.search(r'class="edition">([^<]+)<', s)
    edition = m.group(1).strip() if m else "?"
    slips = sorted(f for f in os.listdir(os.path.join(ROOT, "amendments")) if f.startswith(f"book-{letter}-ed")) if os.path.isdir(os.path.join(ROOT, "amendments")) else []
    for slip in slips:
        t = open(os.path.join(ROOT, "amendments", slip)).read()
        bb = Balance(); bb.feed(t)
        if bb.errors or bb.stack: fail(f"{slip}: tags {bb.errors[:2]} open={bb.stack[:3]}")
        for anchor in re.findall(rf'\.\./book-{letter}\.html#([^"]+)"', t):
            if anchor not in ids: fail(f"{slip}: anchor #{anchor} missing in book-{letter}.html")
        n = t.count('class="entry"')
        if f"amendments/{slip}" not in s: fail(f"book-{letter}: colophon does not link {slip}")
        print(f"book-{letter}: {edition} · {slip}: {n} entries")
    if not slips: print(f"book-{letter}: {edition} · no slips")
print("OK" if ok else "PROBLEMS FOUND"); sys.exit(0 if ok else 1)
