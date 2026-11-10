"""Bill photos end to end through the real stack, with real AI reads.

The 12 bills from e2e/bills/make_bills.py go in one by one on a phone-sized browser, exactly as Papa
would enter them: Home → Maal aaya / Maal bika → photo → check screen → fix what the AI got wrong →
Approve. The fake AI container (e2e/mock_ai.py) answers with the replies an AI model really gave for
each photo (e2e/bills/answers.json, one per bill in order). At the end every item's stock must equal
what the bills really say: received minus sold.

Needs the stack from e2e/stack_e2e.py running (it creates the owner Papa, PIN 2468), and:
    python e2e/bills/make_bills.py                  # photos + truth.json
    (an AI reads each photo with the app's prompt → e2e/bills/answers.json)
    STACK_ROOT=... python e2e/bills_e2e.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(os.environ.get("STACK_ROOT") or Path(__file__).resolve().parents[1])
ENV = dict(l.split("=", 1) for l in (ROOT / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
PORT = int(ENV.get("HTTPS_PORT", "443") or 443)
STOCK = f"https://{ENV['STOCK_DOMAIN']}" + ("" if PORT == 443 else f":{PORT}")
BILLS = Path(__file__).resolve().parent / "bills"

BRANDS = {"op", "bata", "paragon", "action", "relaxo", "campus", "liberty", "lakhani", "बाटा", "रिलैक्सो", "पैरागॉन"}
COLOURS = {"black", "brown", "blue", "navy", "white", "tan", "grey", "red", "golden", "kala", "नीला", "काला"}


SAME_COLOUR = {"kala": "black", "काला": "black", "neela": "blue", "नीला": "blue"}


def norm(s: str) -> str:
    """One key per item, the way Papa thinks of it: word order, case and kala/black don't matter."""
    words = (SAME_COLOUR.get(w, w) for w in re.split(r"[^\w]+", unicodedata.normalize("NFC", s.lower())) if w)
    return " ".join(sorted(words))


def split(item: str) -> tuple[str, str, str]:
    """How Papa would type an item: brand, article, colour."""
    w = item.split()
    colour = w.pop() if len(w) > 1 and w[-1].lower() in COLOURS else ""
    brand = w.pop(0) if len(w) > 1 and w[0].lower() in BRANDS else ""
    return brand, " ".join(w), colour


def item_name(it: dict) -> str:
    return " ".join(x for x in (it["brand"], it["article"], it["colour"]) if x and x != "-")


def main() -> int:
    truth = json.loads((BILLS / "truth.json").read_text())
    report: list[str] = []
    fixes_total = fields_total = 0
    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, ignore_https_errors=True)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(STOCK)
        page.click("#people button[data-name='Papa']")
        for d in "2468":
            page.click(f"#pinpad button[data-k='{d}']")
        expect(page.locator("#app")).to_be_visible(timeout=15000)
        api = lambda method, path, body=None: page.evaluate(
            "([m, p, b]) => fetch(p, { method: m, headers: { 'content-type': 'application/json', 'x-requested-with': 'StockRoom' }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, data: await r.json() }))",
            [method, path, body])
        r = api("PUT", "/api/v1/admin/settings", {"llm": {"provider": "gemini", "baseUrl": "http://mock-ai:8080", "model": "bills-e2e", "apiKey": "AIza-bills-e2e"}})
        assert r["status"] == 200, r
        page.reload()
        expect(page.locator("#app")).to_be_visible(timeout=15000)

        for t in truth:
            items = api("GET", "/api/v1/items")["data"]["items"]
            by_name = {norm(item_name(it)): it["sku"] for it in items}
            page.click("#tab-home")
            page.click("#homeIn" if t["kind"] == "in" else "#homeOut")
            page.set_input_files("#billGallery", str(BILLS / "img" / t["file"]))
            expect(page.locator("#billApprove")).to_be_visible(timeout=30000)
            notice = page.locator("#billCheck .notice").first.inner_text()
            warned = "•" in notice or "already entered" in notice

            def rows() -> int:
                return page.locator("#billCheck .bill-row").count()

            def shown(i: int) -> dict:
                v = lambda sel: page.input_value(sel) if page.locator(sel).count() else ""
                sku = v(f"#bl-sku-{i}")
                name = " ".join(x for x in (v(f"#bl-brand-{i}"), v(f"#bl-article-{i}"), v(f"#bl-colour-{i}")) if x)
                if sku:
                    it = next((x for x in items if x["sku"] == sku), None)
                    name = item_name(it) if it else sku
                return {"qty": v(f"#bl-qty-{i}"), "rate": v(f"#bl-rate-{i}"), "name": name, "sku": sku}

            # Line up what the AI read with the real rows, then fix the differences like Papa would.
            got = [shown(i) for i in range(rows())]
            want = t["rows"]
            order: list[int | None] = []
            free = list(range(len(got)))
            for w in want:
                score = lambda i: (got[i]["qty"] == str(w["qty"])) + (got[i]["rate"] == ("" if w["rate"] is None else str(w["rate"]))) + 2 * (norm(got[i]["name"]) == norm(w["item"]))
                best = max(free, key=score, default=None)
                order.append(best if best is not None and score(best) > 0 else None)
                if order[-1] is not None:
                    free.remove(order[-1])
            fixes: list[str] = []
            for i in sorted(free, reverse=True):  # rows the AI made up
                fixes.append(f"removed row '{got[i]['name']}'")
                page.click(f"#billCheck [data-remove='{i}']")
                order = [None if o == i else (o - 1 if o is not None and o > i else o) for o in order]
            for j, w in enumerate(want):
                if order[j] is None:  # a row the AI missed
                    page.click("#billAddRow")
                    order[j] = rows() - 1
                    fixes.append(f"added row '{w['item']}'")
                    got_row = {"qty": "", "rate": "", "name": "", "sku": ""}
                else:
                    got_row = got[order[j]] if order[j] < len(got) else {"qty": "", "rate": "", "name": "", "sku": ""}
                i = order[j]
                fields_total += 3
                if got_row["name"] and norm(got_row["name"]) != norm(w["item"]):
                    fixes.append(f"item '{got_row['name']}' → '{w['item']}'")
                existing = by_name.get(norm(w["item"]), "")
                if t["kind"] == "out" or existing:
                    if page.input_value(f"#bl-sku-{i}") != existing:
                        page.select_option(f"#bl-sku-{i}", existing)
                else:
                    if page.input_value(f"#bl-sku-{i}") != "":
                        page.select_option(f"#bl-sku-{i}", "")
                    b, a, c = split(w["item"])
                    page.fill(f"#bl-brand-{i}", b)
                    page.fill(f"#bl-article-{i}", a)
                    page.fill(f"#bl-colour-{i}", c)
                if page.input_value(f"#bl-qty-{i}") != str(w["qty"]):
                    fixes.append(f"{w['item']}: qty {page.input_value(f'#bl-qty-{i}') or '—'} → {w['qty']}")
                    page.fill(f"#bl-qty-{i}", str(w["qty"]))
                rate = "" if w["rate"] is None else str(w["rate"])
                if page.input_value(f"#bl-rate-{i}") != rate:
                    fixes.append(f"{w['item']}: rate {page.input_value(f'#bl-rate-{i}') or '—'} → {rate or '—'}")
                    page.fill(f"#bl-rate-{i}", rate)
            fixes_total += len(fixes)
            page.click("#billApprove")
            expect(page.locator("#billDoneTitle")).to_be_visible(timeout=15000)
            report.append(f"{'✓' if not fixes else '✎'} {t['file']:28} {'warning shown' if warned else 'no warning':13} {'; '.join(fixes) or 'approved as read'}")

        # Stock must equal what the bills really say.
        expected: dict[str, int] = {}
        for t in truth:
            for w in t["rows"]:
                expected[norm(w["item"])] = expected.get(norm(w["item"]), 0) + (w["qty"] if t["kind"] == "in" else -w["qty"])
        items = {norm(item_name(it)): it for it in api("GET", "/api/v1/items")["data"]["items"]}
        wrong = [f"{k}: stock {items[k]['qty'] if k in items else 'missing'} ≠ {v}" for k, v in expected.items() if k not in items or items[k]["qty"] != v]
        bills = api("GET", "/api/v1/bills")["data"]["bills"]
        photos = sum(1 for b in bills if b["has_photo"])
        br.close()

    print("\n".join(report))
    print(f"\nPapa's fixes: {fixes_total} (over {fields_total} row fields in {len(truth)} bills)")
    print(f"stock after all bills: {len(expected) - len(wrong)}/{len(expected)} items exactly right; {photos} bills saved with their photo")
    for w in wrong:
        print("  ✗", w)
    if errors:
        print("browser errors:", errors[:3])
    if wrong or errors:
        print("BILLS E2E FAILED")
        return 1
    print("BILLS E2E OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
