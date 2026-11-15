"""Make test bill photos with known answers, for measuring how well an AI reads bills.

Renders challans, parchis and sale bills in a browser (printed and handwritten fonts, English,
Hindi and Hinglish, tilted, faint, with a crossed-out row and a deliberate sum mistake) and writes:
  e2e/bills/img/NN-name.jpg   the photos
  e2e/bills/truth.json        what each bill really says
Optional: REAL_CHALLAN=/path/to/photo.jpg adds a real photo with its answer given in REAL_TRUTH (JSON).

Run:  python e2e/bills/make_bills.py      (Python Playwright with Chromium; needs internet for Google Fonts)
"""
from __future__ import annotations

import json
import os
import shutil
import zlib
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
IMG = HERE / "img"

# kind: in = goods received, out = sold. Each row: qty, item as a person would type it, rate, amount (None = not written).
BILLS = [
    {"name": "printed-invoice", "kind": "in", "font": "print", "supplier": "Agra Footwear Traders", "billNo": "AFT/1182", "date": "2026-10-04",
     "rows": [(24, "Bata Comfit Black", 420, 10080), (12, "Bata Comfit Brown", 420, 5040), (36, "Paragon Slipper Blue", 140, 5040), (18, "Action School Shoe Black", 310, 5580)]},
    {"name": "handwritten-challan", "kind": "in", "font": "hand", "supplier": "Sharma Shoes", "billNo": "", "date": "2026-10-11",
     "rows": [(30, "Relaxo Flite Navy", 199, 5970), (20, "Campus Run White", 650, 13000), (10, "Liberty Gents Sandal Tan", 540, 5400)]},
    {"name": "hindi-parchi", "kind": "in", "font": "hindi", "supplier": "गुप्ता ट्रेडर्स", "billNo": "", "date": "2026-10-15",
     "rows": [(24, "रिलैक्सो फ्लाइट नीला", 199, 4776), (12, "बाटा चप्पल काला", 260, 3120)]},
    {"name": "hinglish-parchi", "kind": "in", "font": "hand", "supplier": "Meenu", "billNo": "", "date": "2026-10-18",
     "rows": [(12, "Bata comfit kala", 420, 5040), (6, "ladies sandal golden", 310, 1860), (48, "OP AirMix", 355, 17040)]},
    {"name": "sale-bill", "kind": "out", "font": "print", "supplier": "", "billNo": "212", "date": "2026-10-20",
     "rows": [(1, "OP AirMix", 650, 650), (2, "Paragon Slipper Blue", 220, 440), (1, "Campus Run White", 999, 999)]},
    {"name": "tilted-faint", "kind": "in", "font": "hand", "tilt": 4, "faint": True, "supplier": "Khan Brothers", "billNo": "77", "date": "2026-10-22",
     "rows": [(15, "Lakhani Sports Grey", 380, 5700), (25, "Paragon Slipper Black", 140, 3500)]},
    {"name": "crossed-out-row", "kind": "in", "font": "hand", "supplier": "Sharma Shoes", "billNo": "", "date": "2026-10-25", "crossed": (5, "Campus Run Red", 650, 3250),
     "rows": [(8, "Campus Run Black", 650, 5200), (16, "Relaxo Flite Navy", 199, 3184)]},
    {"name": "no-rates", "kind": "in", "font": "hand", "supplier": "Ghar ka maal", "billNo": "", "date": "2026-10-26",
     "rows": [(40, "Leather Belt Brown", None, None), (25, "Leather Wallet Black", None, None)]},
    {"name": "sum-mistake", "kind": "in", "font": "print", "supplier": "Agra Footwear Traders", "billNo": "AFT/1201", "date": "2026-10-28", "printedTotal": 9000,
     "rows": [(10, "Bata Comfit Black", 420, 4200), (20, "Paragon Slipper Blue", 140, 2800)]},
    {"name": "hindi-parchi-2", "kind": "in", "font": "hindi", "supplier": "वर्मा एंड संस", "billNo": "", "date": "2026-10-30",
     "rows": [(24, "पैरागॉन चप्पल नीला", 140, 3360), (10, "स्कूल जूता काला", 310, 3100)]},
    {"name": "long-invoice", "kind": "in", "font": "print", "supplier": "Delhi Shoe House", "billNo": "DSH-5521", "date": "2026-11-02",
     "rows": [(12, "Bata Comfit Black", 420, 5040), (12, "Bata Comfit Brown", 420, 5040), (24, "Relaxo Flite Navy", 199, 4776), (24, "Relaxo Flite Red", 199, 4776),
              (10, "Campus Run White", 650, 6500), (10, "Campus Run Black", 650, 6500), (36, "Paragon Slipper Blue", 140, 5040), (36, "Paragon Slipper Black", 140, 5040),
              (8, "Liberty Gents Sandal Tan", 540, 4320), (20, "Action School Shoe Black", 310, 6200)]},
    # "Doctor" handwriting: scrawled fonts, every letter at its own angle, size and height, slanted, some faint.
    {"name": "scrawl-challan", "kind": "in", "font": "scrawl1", "jitter": 1.0, "supplier": "Sharma Shoes", "billNo": "", "date": "2026-11-03",
     "rows": [(18, "Campus Run Black", 650, 11700), (24, "Paragon Slipper Blue", 140, 3360), (12, "Relaxo Flite Red", 199, 2388)]},
    {"name": "scrawl-faint", "kind": "in", "font": "scrawl2", "jitter": 1.6, "tilt": -3, "faint": True, "supplier": "Khan Brothers", "billNo": "81", "date": "2026-11-04",
     "rows": [(30, "Lakhani Sports Grey", 380, 11400), (6, "Liberty Gents Sandal Tan", 540, 3240)]},
    {"name": "scrawl-hindi", "kind": "in", "font": "hindi", "jitter": 1.6, "skew": -12, "supplier": "गुप्ता ट्रेडर्स", "billNo": "", "date": "2026-11-05",
     "rows": [(36, "रिलैक्सो फ्लाइट नीला", 199, 7164), (20, "बाटा चप्पल काला", 260, 5200)]},
    {"name": "scrawl-sale", "kind": "out", "font": "scrawl3", "jitter": 1.3, "skew": -8, "supplier": "", "billNo": "219", "date": "2026-11-06",
     "rows": [(2, "Campus Run Black", 999, 1998), (3, "Paragon Slipper Blue", 220, 660), (1, "Lakhani Sports Grey", 699, 699)]},
]

DEVA = str.maketrans("0123456789", "०१२३४५६७८९")


def scrawl(text: str, b: dict, seed: int) -> str:
    """Wrap each letter in its own angle, size and height, the way a hurried hand writes."""
    j = b.get("jitter")
    if not j or not text:
        return text
    import random
    import unicodedata
    rnd = random.Random(seed)
    # whole letters: a Hindi consonant keeps its vowel signs and the consonant joined after a ्
    letters: list[str] = []
    for ch in text:
        if letters and (unicodedata.category(ch) in ("Mn", "Mc") or letters[-1].endswith("\u094d")):
            letters[-1] += ch
        else:
            letters.append(ch)
    out = []
    for ch in letters:
        if ch == " ":
            out.append(f"<span style='display:inline-block;width:{0.25 + rnd.random() * 0.3:.2f}em'></span>")
            continue
        out.append(f"<span style='display:inline-block;transform:rotate({rnd.uniform(-9, 9) * j:.1f}deg) translateY({rnd.uniform(-3, 3) * j:.1f}px) scale({1 + rnd.uniform(-0.12, 0.12) * j:.2f});margin-right:{rnd.uniform(-2.5, 1) * j:.1f}px'>{ch}</span>")
    return "".join(out)


def fmt(n, b) -> str:
    if n is None:
        return ""
    s = f"{n}"
    return s.translate(DEVA) if b.get("digits") == "deva" else s


def html(b: dict) -> str:
    fonts = {"print": "'Roboto Mono', monospace", "hand": "'Caveat', cursive", "hindi": "'Kalam', cursive",
             "scrawl1": "'Reenie Beanie', cursive", "scrawl2": "'Zeyada', cursive", "scrawl3": "'Homemade Apple', cursive"}
    body_font = fonts[b["font"]]
    title = {"in": "DELIVERY CHALLAN", "out": "CASH MEMO"}[b["kind"]] if b["font"] != "hindi" else "चालान"
    rows = list(b["rows"])
    crossed = b.get("crossed")
    tr = []
    for i, (q, item, rate, amt) in enumerate(rows):
        sc = lambda x, k: scrawl(str(x), b, zlib.crc32(f"{b['name']}|{i}|{k}".encode())) if x not in (None, "") else ""
        tr.append(f"<tr><td>{sc(fmt(q, b), 0)}</td><td>{sc(item, 1)}</td><td>{sc(fmt(rate, b), 2)}</td><td>{sc(fmt(amt, b), 3)}</td></tr>")
        if crossed and i == 0:
            q2, it2, r2, a2 = crossed
            tr.append(f"<tr class='x'><td>{q2}</td><td>{it2}</td><td>{r2}</td><td>{a2}</td></tr>")
    total = b.get("printedTotal") if b.get("printedTotal") is not None else (sum(r[3] for r in rows) if all(r[3] is not None for r in rows) else None)
    d = b["date"].split("-")
    date = f"{int(d[2])}-{int(d[1])}-{d[0][2:]}"
    tilt = b.get("tilt", 0)
    ink = "#3a4a8a" if b["font"] != "print" else "#222"
    faint = "opacity:.72;filter:blur(.4px) contrast(.8);" if b.get("faint") else ""
    return f"""<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&family=Kalam:wght@400&family=Roboto+Mono&family=Reenie+Beanie&family=Zeyada&family=Homemade+Apple&display=block" rel="stylesheet">
<style>
body{{margin:0;background:#cfc8bd;}}
.paper{{width:760px;margin:40px;padding:36px 40px;background:#fbf8f1 linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.05));box-shadow:0 2px 10px rgba(0,0,0,.25);transform:rotate({tilt}deg);{faint}}}
td,.meta b,.total{{font-style:normal}} td>span,.total>span{{}} td{{transform:skewX({b.get("skew", 0)}deg)}}
h1{{font:700 30px 'Roboto Mono',monospace;color:#1d6b3a;text-align:center;margin:0 0 14px;letter-spacing:2px}}
.meta{{display:flex;justify-content:space-between;font:20px 'Roboto Mono',monospace;color:#555;margin-bottom:10px}}
.meta b{{font:30px {body_font};color:{ink}}}
table{{width:100%;border-collapse:collapse}}
th{{font:600 16px 'Roboto Mono',monospace;color:#1d6b3a;border:1px solid #6aa57d;padding:6px}}
td{{font:30px {body_font};color:{ink};border:1px solid #6aa57d;padding:4px 10px;height:42px}}
td:first-child{{width:80px;text-align:center}} td:nth-child(3),td:nth-child(4){{width:120px;text-align:right}}
tr.x td{{text-decoration:line-through;text-decoration-thickness:3px;opacity:.8}}
.total{{text-align:right;font:32px {body_font};color:{ink};margin-top:10px}}
</style></head><body><div class="paper">
<h1>{title}</h1>
<div class="meta"><span>From: <b>{b["supplier"]}</b></span><span>No. <b>{b["billNo"]}</b></span><span>Date <b>{date}</b></span></div>
<table><tr><th>QTY</th><th>PARTICULARS</th><th>RATE</th><th>AMOUNT</th></tr>{"".join(tr)}
{"<tr><td></td><td></td><td></td><td></td></tr>" * 2}</table>
{f'<div class="total">Total {scrawl(fmt(total, b), b, 99)}</div>' if total is not None else ''}
</div></body></html>"""


def main() -> None:
    if IMG.exists():
        shutil.rmtree(IMG)
    IMG.mkdir(parents=True)
    truth = []
    n = 1
    real = os.environ.get("REAL_CHALLAN")
    if real:
        shutil.copy(real, IMG / "01-real-challan.jpg")
        truth.append({"file": "01-real-challan.jpg", **json.loads(os.environ["REAL_TRUTH"])})
        n = 2
    with sync_playwright() as p:
        br = p.chromium.launch()
        page = br.new_page(viewport={"width": 860, "height": 1100}, device_scale_factor=1.5)
        for b in BILLS:
            page.set_content(html(b), wait_until="networkidle")
            page.evaluate("document.fonts.ready")
            f = f"{n:02d}-{b['name']}.jpg"
            page.locator(".paper").screenshot(path=str(IMG / f), type="jpeg", quality=80)
            sums_ok = b.get("printedTotal") is None
            truth.append({"file": f, "kind": b["kind"], "supplier": b["supplier"], "billNo": b["billNo"], "date": b["date"], "sumsOk": sums_ok,
                          "rows": [{"qty": q, "item": it, "rate": r, "amount": a} for q, it, r, a in b["rows"]]})
            n += 1
        br.close()
    (HERE / "truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=1))
    print(f"{len(truth)} bills in {IMG}")


if __name__ == "__main__":
    main()
