"""End-to-end test of the whole IDEALX stack through Caddy: shop, admin, dealer portal, API,
storage, worker, email and Stock Room, as a shopper, the owner and a dealer would use them.

Needs the production stack running on this machine with the e2e override, e.g. from the repo root:

    sh scripts/prod.sh init        # then in .env: SITE_DOMAIN=idealx.localhost STOCK_DOMAIN=stock.idealx.localhost
                                    # RAZORPAY_WEBHOOK_SECRET=whsec_e2e_local_only SMTP_HOST=mailpit SMTP_PORT=1025 SMTP_TLS=false
    docker compose --env-file .env -f infra/docker/compose.prod.yml -f e2e/compose.e2e.yml up -d --build
    DATABASE_URL=postgresql://idealx:<POSTGRES_PASSWORD>@127.0.0.1:55433/idealx pnpm db:seed > /tmp/seed.log
    python e2e/stack_e2e.py /tmp/seed.log

Python Playwright with Chromium is required. Exits non-zero on the first failure.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import http.client
import json
import os
import re
import socket
import ssl
import struct
import subprocess
import sys
import time
import uuid
import zlib
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

# STACK_ROOT: the repo path as Docker sees it, if it differs (e.g. /tmp vs /private/tmp on a Mac VM).
ROOT = Path(os.environ.get("STACK_ROOT") or Path(__file__).resolve().parents[1])
ENV = dict(l.split("=", 1) for l in (ROOT / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
SITE, STOCK = ENV["SITE_DOMAIN"], ENV["STOCK_DOMAIN"]
PORT = int(ENV.get("HTTPS_PORT", "443") or 443)
BASE, STOCK_BASE = f"https://{SITE}" + ("" if PORT == 443 else f":{PORT}"), f"https://{STOCK}" + ("" if PORT == 443 else f":{PORT}")
DC = ["docker", "compose", "--env-file", str(ROOT / ".env"), "-f", str(ROOT / "infra/docker/compose.prod.yml"), "-f", str(ROOT / "e2e/compose.e2e.yml")]
CTX = ssl._create_unverified_context()  # Caddy's local CA for *.localhost


def step(msg: str) -> None:
    print(f"· {msg}", flush=True)


def https(method: str, url: str, body: bytes | None = None, headers: dict | None = None, follow: bool = False):
    """HTTPS to the local Caddy whatever the name resolves to; returns (status, headers, body)."""
    for _ in range(5):
        u = urlsplit(url)
        conn = http.client.HTTPSConnection(u.hostname, u.port or 443, context=CTX, timeout=30)
        sock = socket.create_connection(("127.0.0.1", u.port or 443), timeout=30)
        conn.sock = CTX.wrap_socket(sock, server_hostname=u.hostname)
        conn.request(method, (u.path or "/") + (f"?{u.query}" if u.query else ""), body=body, headers={"Host": u.netloc, **(headers or {})})
        r = conn.getresponse()
        data, hdrs = r.read(), dict(r.getheaders())
        if follow and r.status in (301, 302, 303, 307) and hdrs.get("Location"):
            url, method, body = hdrs["Location"], "GET", None
            continue
        return r.status, hdrs, data
    raise AssertionError("too many redirects")


def dc(*args: str, tries: int = 2) -> str:
    for i in range(tries):
        out = subprocess.run(DC + list(args), capture_output=True, text=True)
        if out.returncode == 0:
            return out.stdout
        print(out.stderr[-2000:], file=sys.stderr)
        time.sleep(5)
    raise AssertionError(f"docker compose {' '.join(args)} failed")


def sql(q: str) -> str:
    out = subprocess.run(DC + ["exec", "-T", "postgres", "psql", "-U", "idealx", "-d", "idealx", "-tAc", q], capture_output=True, text=True, check=True)
    return out.stdout.strip()


def totp(secret: str) -> str:
    key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
    h = hmac.new(key, struct.pack(">Q", int(time.time()) // 30), hashlib.sha1).digest()
    o = h[-1] & 15
    return f"{(struct.unpack('>I', h[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"


def png(w: int = 64, h: int = 64) -> bytes:
    raw = b"".join(b"\x00" + bytes([122, 31, 43]) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def wait_for(fn, what: str, timeout: float = 60):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(1)
    raise AssertionError(f"timed out waiting for {what}")


def main() -> int:
    seed_log = Path(sys.argv[1]).read_text()
    totp_secret = re.search(r"TOTP secret[^:]*:\s*([A-Z2-7]+)", seed_log).group(1)

    # ---- edge: what is public and what is not -------------------------------------------
    step("edge: health, internal API hidden, robots, sitemap, legal pages")
    assert https("GET", f"{BASE}/api/v1/healthz")[0] == 200
    assert https("GET", f"{BASE}/api/healthz")[0] == 200
    assert https("GET", f"{BASE}/api/v1/docs")[0] == 404, "FastAPI docs must not be public"
    assert https("GET", f"{BASE}/api/v1/auth/otp/request", b"{}")[0] == 404
    s, _, robots = https("GET", f"{BASE}/robots.txt")
    assert s == 200 and b"Disallow: /admin" in robots and f"{BASE}/sitemap.xml".encode() in robots, robots
    s, _, smap = https("GET", f"{BASE}/sitemap.xml")
    assert s == 200 and b"/products/dms-service-boot" in smap, smap[:300]
    for p, needle in [("/terms", b"Agra"), ("/privacy", b"Digital Personal Data Protection"), ("/returns", b"30-day exchange"), ("/shipping", b"Free shipping")]:
        s, _, page = https("GET", f"{BASE}{p}")
        assert s == 200 and needle in page, (p, s)
    s, h, _ = https("GET", f"{BASE}/")
    assert "max-age=31536000" in h.get("Strict-Transport-Security", "") and "Server" not in h, h
    assert https("GET", f"{BASE}/_next/image?url=https%3A%2F%2Fexample.com%2Fa.png&w=64&q=75")[0] in (400, 404)
    s, _, lp = https("GET", f"{BASE}/login?from=https%3A%2F%2Fevil.example%2F")
    cb = re.search(rb'callbackUrl\\?":\\?"([^"\\]*)', lp)
    assert s == 200 and cb and cb.group(1) == b"/", ("login must not carry an off-site redirect", cb and cb.group(1))
    assert https("GET", f"https://www.{SITE}" + ("" if PORT == 443 else f":{PORT}") + "/terms")[0] == 301

    # ---- Stock Room: owner, stock, API key, then switch the link on -----------------------
    step("stock room: owner setup, stock by size run, API key")
    xr = {"x-requested-with": "StockRoom", "content-type": "application/json"}
    s, h, _ = https("POST", f"{STOCK_BASE}/api/v1/auth/setup", json.dumps({"name": "Papa", "pin": "2468", "shop": "Ideal Shoes", "appUrl": STOCK_BASE}).encode(), xr)
    if s not in (200, 201):  # a re-run: the owner exists, sign in instead
        users = json.loads(https("GET", f"{STOCK_BASE}/api/v1/auth/state")[2])["users"]
        papa = next(u for u in users if u["name"] == "Papa")
        s, h, _ = https("POST", f"{STOCK_BASE}/api/v1/auth/login", json.dumps({"userId": papa["id"], "pin": "2468"}).encode(), xr)
        assert s == 200, s
    cookie = h["Set-Cookie"].split(";")[0]
    rows = [{"brand": "IDEALX", "article": "DMS Boot", "colour": "Black", "size": sz, "cat": "boot", "cost": 1400, "mrp": 3999, "qty": q, "loc": "R1"} for sz, q in (("9", 7), ("10", 3))]
    assert https("POST", f"{STOCK_BASE}/api/v1/items", json.dumps({"rows": rows}).encode(), {**xr, "cookie": cookie})[0] == 200
    start_qty = json.loads(https("GET", f"{STOCK_BASE}/api/v1/items/IDEA-DMSBOOT-BLA-9", headers={"cookie": cookie})[2])["item"]["qty"]
    s, _, kb = https("POST", f"{STOCK_BASE}/api/v1/admin/api-keys", json.dumps({"name": "Website", "scopes": ["read", "write"]}).encode(), {**xr, "cookie": cookie})
    key = json.loads(kb)["key"]
    s, _, xl = https("GET", f"{STOCK_BASE}/api/v1/export/stock.xlsx", headers={"cookie": cookie})
    assert s == 200 and xl[:2] == b"PK", "Stock Room Excel export through the proxy"
    env_text = (ROOT / ".env").read_text()
    env_text = re.sub(r"^INVENTORY_API_KEY=.*$", f"INVENTORY_API_KEY={key}", env_text, flags=re.M)
    (ROOT / ".env").write_text(env_text)
    dc("up", "-d", "api", "worker", "beat", "web")
    wait_for(lambda: https("GET", f"{BASE}/api/v1/healthz")[0] == 200 and https("GET", f"{BASE}/api/healthz")[0] == 200, "site back after env change", 120)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=[f"--host-resolver-rules=MAP {SITE} 127.0.0.1, MAP *.{SITE} 127.0.0.1"])
        errors: list[str] = []

        # ---- owner: admin login with TOTP, Stock Room code, product photo ----------------
        step("admin: password + authenticator code")
        admin = browser.new_context(ignore_https_errors=True, viewport={"width": 1280, "height": 900})
        page = admin.new_page()
        page.on("pageerror", lambda e: errors.append(f"admin: {e}"))
        page.goto(f"{BASE}/login?from=/admin")
        page.wait_for_load_state("networkidle")
        page.fill("#email", "admin@bharatboot.local")
        page.fill("#password", "ChangeMe123!")
        page.click("form button[type=submit]")
        expect(page.locator("#totp")).to_be_visible(timeout=15000)
        page.fill("#totp", totp(totp_secret))
        page.click("form button[type=submit]")
        page.wait_for_url(lambda u: urlsplit(u).path.startswith("/admin"), timeout=20000)
        page.goto(f"{BASE}/admin/products")
        page.get_by_text("DMS Service Boot").first.click()
        page.wait_for_url(re.compile(r"/admin/products/[0-9a-f-]{36}$"))
        row = page.locator("tr", has_text="UK 9").filter(has_text="Black")
        row.locator("input[name=barcode]").fill("IDEA-DMSBOOT-BLA-9")
        row.get_by_role("button", name="Save").click()
        expect(row.locator("input[name=barcode]")).to_have_value("IDEA-DMSBOOT-BLA-9")
        step("admin: upload a product photo")
        page.set_input_files("#image", files=[{"name": "boot.png", "mimeType": "image/png", "buffer": png()}])
        page.fill("#alt", "Black DMS boot")
        page.get_by_role("button", name="Upload").click()
        expect(page.get_by_text("Main photo")).to_be_visible(timeout=15000)
        img_url = page.locator("figure img").first.get_attribute("src")
        assert img_url and img_url.startswith(f"{BASE}/{ENV.get('S3_BUCKET') or 'media'}/public/"), img_url
        s, h, data = https("GET", img_url)
        assert s == 200 and data[:4] == b"\x89PNG" and h.get("Content-Type", "").startswith("image/png"), (s, h)

        # ---- stock sync pulls Stock Room's numbers ---------------------------------------
        step(f"worker: inventory.sync_stock copies Stock Room's {start_qty} pairs onto the variant")
        dc("exec", "-T", "worker", "celery", "-A", "app.worker.celery_app", "call", "inventory.sync_stock")
        q = "select i.on_hand from inventory i join product_variants v on v.id=i.variant_id where v.sku='IDX-BOOT-DMS-9-BLACK'"
        wait_for(lambda: sql(q) == str(start_qty), f"on_hand = {start_qty} after sync")

        # ---- shopper on a phone: browse, buy as a guest -----------------------------------
        step("shopper (390px): menu, category, product declarations, cart, checkout")
        phone = browser.new_context(ignore_https_errors=True, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        page = phone.new_page()
        page.on("pageerror", lambda e: errors.append(f"phone: {e}"))
        page.goto(BASE)
        page.get_by_role("button", name="Open menu").click()
        menu = page.get_by_role("dialog", name="Menu")
        expect(menu).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth") <= 390, "no horizontal scroll at 390px"
        page.keyboard.press("Escape")
        expect(menu).to_be_hidden()
        page.goto(f"{BASE}/products?category=boots")
        page.get_by_text("DMS Service Boot").first.click()
        expect(page.get_by_text("Product declarations")).to_be_visible()
        for k in ("MRP", "Net quantity", "1 pair", "Country of origin", "Manufactured by", "Customer care"):
            expect(page.locator("#declarations").locator("xpath=..")).to_contain_text(k)
        expect(page.locator("main img").first).to_have_attribute("src", img_url)
        page.locator("button", has_text="UK 9").filter(has_text="Black").click()
        page.get_by_role("button", name=re.compile("add to cart", re.I)).click()
        page.wait_for_timeout(800)
        page.goto(f"{BASE}/cart")
        expect(page.get_by_text("Includes GST")).to_be_visible()
        expect(page.locator("aside")).to_contain_text("₹2,899")
        page.goto(f"{BASE}/checkout")
        email = f"buyer-{uuid.uuid4().hex[:6]}@example.com"
        page.fill("#email", email)
        for pre in ("shipping", "billing"):
            page.fill(f"[name='{pre}.fullName']", "Asha Verma")
            page.fill(f"[name='{pre}.phone']", "9876543210")
            page.fill(f"[name='{pre}.line1']", "12 MG Road")
            page.fill(f"[name='{pre}.city']", "Lucknow")
            page.fill(f"[name='{pre}.pincode']", "226001")
            page.fill(f"[name='{pre}.state']", "Uttar Pradesh")
            page.select_option(f"[name='{pre}.stateCode']", "09")
        page.locator("form button[type=submit]").last.click()
        page.wait_for_url(re.compile(r"/checkout/[0-9a-f-]{36}/pay"), timeout=20000)
        order_id = re.search(r"/checkout/([0-9a-f-]{36})/pay", page.url).group(1)
        expect(page.get_by_text("Online payment is not available yet")).to_be_visible()
        total, cgst, sgst, taxable = sql(f"select grand_total, cgst_total, sgst_total, taxable_value from orders where id='{order_id}'").split("|")
        assert int(total) == 289900, f"buyer pays the shown price incl. GST, got {total}"
        assert int(taxable) + int(cgst) + int(sgst) == 289900 and int(cgst) > 0, (taxable, cgst, sgst)
        assert sql(f"select contact_email from orders where id='{order_id}'") == email

        # ---- Razorpay confirms the payment (signed webhook, as Razorpay sends it) ---------
        step("payment: signed webhook marks the order paid; invoice, stock-out and email follow")
        gw = f"order_E2E{uuid.uuid4().hex[:10]}"
        sql(f"insert into payments (id, order_id, gateway, gateway_order_id, amount, currency, status, created_at, updated_at) values (gen_random_uuid(), '{order_id}', 'razorpay', '{gw}', {total}, 'INR', 'created', now(), now())")
        event = json.dumps({"id": f"evt_{uuid.uuid4().hex[:12]}", "event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_E2E", "order_id": gw, "amount": int(total), "method": "upi"}}}}).encode()
        sig = hmac.new(b"whsec_e2e_local_only", event, hashlib.sha256).hexdigest()
        s, _, _ = https("POST", f"{BASE}/api/v1/payments/razorpay/webhook", event, {"content-type": "application/json", "x-razorpay-signature": "0" * 64})
        assert s == 400, "unsigned webhook refused"
        s, _, b = https("POST", f"{BASE}/api/v1/payments/razorpay/webhook", event, {"content-type": "application/json", "x-razorpay-signature": sig})
        assert s == 200 and json.loads(b)["ok"], b
        wait_for(lambda: sql(f"select status from orders where id='{order_id}'") == "paid", "order paid")
        wait_for(lambda: sql(f"select pdf_url from invoices where order_id='{order_id}'").startswith("s3://"), "invoice PDF stored privately", 120)
        page.goto(f"{BASE}/checkout/{order_id}/pay")
        expect(page.get_by_text("Thank you")).to_be_visible()
        href = page.get_by_role("link", name="Download GST invoice").get_attribute("href")
        s, _, pdf = https("GET", f"{BASE}{href}", follow=True)
        assert s == 200 and pdf[:4] == b"%PDF", (s, pdf[:40])
        s, h, _ = https("GET", f"{BASE}{href}")
        signed = h.get("Location", "")
        assert s == 302 and "X-Amz-Signature" in signed, h
        assert https("GET", signed.split("?")[0])[0] == 403, "private bucket refuses unsigned reads"

        step("stock room: the web sale is recorded once, and the next sync agrees")
        def stock_qty():
            st, _, bb = https("GET", f"{STOCK_BASE}/api/v1/public/items/IDEA-DMSBOOT-BLA-9", headers={"X-API-Key": key})
            d = json.loads(bb)
            return d if d["item"]["qty"] == start_qty - 1 else None
        d = wait_for(stock_qty, "Stock Room qty one lower after the web order", 90)
        assert any("Web order IDX-" in (m["note"] or "") for m in d["movements"]), d["movements"][:3]
        dc("exec", "-T", "worker", "celery", "-A", "app.worker.celery_app", "call", "inventory.sync_stock")
        wait_for(lambda: sql(q) == str(start_qty - 1), "on_hand one lower after the next sync")

        step("email: order confirmation reached the inbox (Mailpit)")
        def mail():
            try:
                c = http.client.HTTPConnection("127.0.0.1", 58025, timeout=5)
                c.request("GET", f"/api/v1/search?query=to:{email}")
                return json.loads(c.getresponse().read()).get("messages")
            except OSError:
                return None
        msgs = wait_for(mail, "confirmation email", 60)
        assert "confirmed" in msgs[0]["Subject"], msgs[0]

        step("login: phone OTP says SMS is not set up yet (production, no MSG91 key)")
        page.goto(f"{BASE}/login")
        page.wait_for_load_state("networkidle")
        page.get_by_role("tab", name="Phone OTP").click()
        page.fill("#phone", "9876543210")
        page.locator("form button[type=submit]").last.click()
        expect(page.get_by_text("Sign-in by SMS is not available yet")).to_be_visible()

        # ---- dealer: tier prices, bulk CSV ------------------------------------------------
        step("dealer: catalog shows tier prices + GST, bulk CSV with variant SKUs")
        dealer = browser.new_context(ignore_https_errors=True)
        page = dealer.new_page()
        page.on("pageerror", lambda e: errors.append(f"dealer: {e}"))
        page.goto(f"{BASE}/login?from=/wholesale")
        page.wait_for_load_state("networkidle")  # the form submits via React; wait until it is hydrated
        page.fill("#email", "dealer1@bharatboot.local")
        page.fill("#password", "Dealer123!")
        page.click("form button[type=submit]")
        page.wait_for_url(lambda u: urlsplit(u).path.startswith("/wholesale"), timeout=20000)
        page.goto(f"{BASE}/wholesale/catalog")
        expect(page.get_by_text("+ GST").first).to_be_visible()
        page.goto(f"{BASE}/wholesale/bulk-upload")
        page.set_input_files("#csv", files=[{"name": "order.csv", "mimeType": "text/csv", "buffer": b"sku,size,color,quantity\nIDX-BOOT-DMS-10-BLACK,10,Black,24\nNOPE,1,x,3\n"}])
        page.get_by_role("button", name=re.compile("Upload")).click()
        page.wait_for_url(re.compile(r"/cart\?bulk=1"), timeout=20000)
        expect(page.locator("aside")).to_contain_text("GST")
        expect(page.locator("aside")).to_contain_text("₹48,703")  # 24 × ₹2,029.30 (tier A, 70%), ex-GST

        step("access: a stranger cannot open someone's account order or admin")
        stranger = browser.new_context(ignore_https_errors=True)
        sp = stranger.new_page()
        sp.goto(f"{BASE}/admin")
        assert "/login" in sp.url
        assert https("GET", f"{BASE}/files/invoices/{uuid.uuid4()}/pdf")[0] in (302, 307)  # to login
        browser.close()

    assert not errors, errors
    print("STACK E2E OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
