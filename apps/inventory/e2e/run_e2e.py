"""End-to-end test for the Stock Room.

Starts the Bun server on a scratch database, drives Chromium through the real UI
(setup → add article → open by code → sell → count → labels → insights → admin),
checks the offline queue, and exits non-zero on any failure.

Run:  python3 e2e/run_e2e.py            (needs bun on PATH and Python Playwright with Chromium)
"""
from __future__ import annotations

import base64
import json
import os
import re
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def wait_health(url: str, timeout: float = 20) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url + "/healthz", timeout=2) as r:
                if json.load(r).get("ok"):
                    return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("server did not become healthy")


def main() -> int:
    bun = shutil.which("bun") or os.path.expanduser("~/.bun/bin/bun")
    if not bun or not os.path.exists(bun):
        bun = "/root/.bun/bin/bun"
    port = free_port()
    data = tempfile.mkdtemp(prefix="stockroom-e2e-")
    env = {**os.environ, "PORT": str(port), "HOST": "127.0.0.1", "DATA_DIR": data, "BACKUP_DIR": data, "BACKUPS": "off", "APP_SECRET": "e2e-secret-e2e-secret-e2e-secret-e2e-secret"}
    server = subprocess.Popen([bun, "src/server.ts"], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    base = f"http://127.0.0.1:{port}"
    failures: list[str] = []
    try:
        wait_health(base)
        with sync_playwright() as p:
            browser = p.chromium.launch()
            # Phone-sized context; HTTP on localhost is a secure context so cookies with Secure still work in Chromium.
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

            # ---- setup ---------------------------------------------------------
            page.goto(base)
            expect(page.locator("#gate-setup")).to_be_visible()
            page.fill("#setupName", "Papa")
            page.fill("#setupPin", "2468")
            page.fill("#setupPin2", "2468")
            page.click("#setupGo")
            expect(page.locator("#app")).to_be_visible()
            expect(page.locator("#meName")).to_have_text("Papa")
            expect(page.locator("#tab-admin")).to_be_visible()
            expect(page.locator("#appVer")).to_have_text(re.compile(r"^v\S+$"))  # which build this phone runs

            # ---- installable as an app ------------------------------------------------
            # Chrome's own check first. Recent Chrome lets almost any page install, so also check the
            # classic criteria Android and iOS still care about against the manifest Chrome parsed.
            cdp = ctx.new_cdp_session(page)
            assert page.evaluate("navigator.serviceWorker.ready.then((r) => Boolean(r.active))"), "service worker not active"
            inst = cdp.send("Page.getInstallabilityErrors")["installabilityErrors"]
            assert inst == [], f"not installable: {inst}"
            man = cdp.send("Page.getAppManifest")
            assert not man.get("errors"), f"manifest errors: {man.get('errors')}"
            parsed = json.loads(man["data"])
            assert parsed.get("name") and parsed.get("short_name") and parsed.get("start_url") == "/", parsed
            assert parsed["display"] == "standalone", parsed
            assert {"192x192", "512x512"} <= {i["sizes"] for i in parsed["icons"]}, parsed["icons"]
            for icon in parsed["icons"] + [{"src": "/icons/icon-192.png"}]:  # the last one is the apple-touch-icon
                with urllib.request.urlopen(base + icon["src"]) as r:
                    assert r.headers["content-type"].startswith("image/"), icon

            # ---- add an article with a size run --------------------------------
            page.click("#tab-add")
            page.fill("#aBrand", "IDEALX")
            page.fill("#aArticle", "DMS Boot")
            page.fill("#aColour", "Black")
            page.select_option("#aCat", "boot")
            page.fill("#aCost", "900")
            page.fill("#aMrp", "2499")
            page.fill("#aLoc", "Godown A")
            for size, q in (("8", "3"), ("9", "5"), ("10", "2")):
                page.fill(f"#sizerun input[data-size='{size}']", q)
            expect(page.locator("#addPreview")).to_contain_text("3 SKUs, 10 units")
            page.click("#addSubmit")
            expect(page.locator("#toast")).to_contain_text("3 new")

            # ---- stock list ----------------------------------------------------
            page.click("#tab-stock")
            expect(page.locator("#stockRows tr")).to_have_count(3)
            expect(page.locator("#stockSummary")).to_contain_text("10 units")
            page.fill("#q", "BLA-9")
            expect(page.locator("#stockRows tr")).to_have_count(1)
            page.fill("#q", "")

            # ---- open by typed code (what a scan does), sell, count ------------
            page.click("#tab-scan")
            page.fill("#codeInput", f"{base}/#IDEA-DMSBOOT-BLA-9")
            page.click("#codeGo")
            expect(page.locator("#sheet")).to_be_visible()
            expect(page.locator("#shQty")).to_have_text("5")
            page.click("#shOut")
            expect(page.locator("#shQty")).to_have_text("4")
            page.click("#shCount")
            page.fill("#shCountVal", "7")
            page.click("#shCountSave")
            expect(page.locator("#shQty")).to_have_text("7")
            expect(page.locator("#shMoves li").first).to_contain_text("count")
            page.click("#shClose")
            expect(page.locator("#scanRecent li").first).to_contain_text("IDEA-DMSBOOT-BLA-9")

            # ---- unknown code gives a readable message ------------------------
            page.fill("#codeInput", "NOPE-1")
            page.click("#codeGo")
            expect(page.locator("#scanMsg")).to_contain_text("No item with code NOPE-1")

            # ---- counter barcode scanner (keyboard wedge), from any tab ----------
            page.click("#tab-stock")
            page.evaluate("document.activeElement && document.activeElement.blur()")
            page.keyboard.type("IDEA-DMSBOOT-BLA-10", delay=5)
            page.keyboard.press("Enter")
            expect(page.locator("#sheet")).to_be_visible()
            expect(page.locator("#shSku")).to_have_text("IDEA-DMSBOOT-BLA-10")
            page.click("#shClose")
            # a person typing at normal speed with nothing focused does not trigger it
            page.evaluate("document.activeElement && document.activeElement.blur()")
            page.keyboard.type("IDEA-DMSBOOT-BLA-10", delay=150)
            page.keyboard.press("Enter")
            page.wait_for_timeout(300)
            expect(page.locator("#sheet")).to_be_hidden()
            page.click("#tab-scan")

            # ---- offline: a sale is queued and syncs on reconnect ----------------
            offline_from = len(errors)
            ctx.set_offline(True)
            page.fill("#codeInput", "IDEA-DMSBOOT-BLA-8")
            page.click("#codeGo")
            expect(page.locator("#shQty")).to_have_text("3")
            page.click("#shOut")
            expect(page.locator("#shQty")).to_have_text("2")
            expect(page.locator("#queueBadge")).to_have_text("1")
            page.click("#shClose")
            ctx.set_offline(False)
            page.evaluate("window.dispatchEvent(new Event('online'))")
            expect(page.locator("#queueBadge")).to_be_hidden(timeout=10000)
            # While offline the service worker answers API reads with its own 503 fallback; that is the expected path.
            errors[offline_from:] = [e for e in errors[offline_from:] if "status of 503" not in e]
            with urllib.request.urlopen(f"{base}/api/v1/public/openapi.json") as r:
                assert json.load(r)["paths"]["/movements"], "openapi"

            # ---- labels --------------------------------------------------------
            page.click("#tab-labels")
            page.click("#lAll")
            expect(page.locator("#lCount")).to_contain_text("3 SKUs")
            expect(page.locator("#lPreview .lbl")).to_have_count(3)
            expect(page.locator("#lPreview .lbl svg").first).to_be_visible()
            page.select_option("#lCopies", "1")
            expect(page.locator("#lCount")).to_contain_text("3 labels")

            # ---- insights dashboard ---------------------------------------------
            page.click("#tab-dash")
            expect(page.locator("#dashTiles .tile")).to_have_count(4)
            expect(page.locator("#dashTiles .tile").first).to_contain_text("11")  # 2 + 7 + 2 units
            expect(page.locator("#chTrend svg")).to_be_visible()
            expect(page.locator("#dashMovers tr").first).to_contain_text("DMS Boot")
            expect(page.locator("#askUnset")).to_be_visible()  # no LLM configured yet
            expect(page.locator("#askGo")).to_be_disabled()
            page.screenshot(path=str(ROOT / "e2e" / "last-phone-insights.png"), full_page=True)

            # ---- admin: staff user, API key, settings ---------------------------
            page.click("#tab-admin")
            page.fill("#uName", "Raju")
            page.fill("#uPin", "1234")
            page.click("#userForm button[type=submit]")
            expect(page.locator("#userRows")).to_contain_text("Raju")
            page.fill("#kName", "Website")
            page.select_option("#kScope", "write")
            page.click("#keyForm button[type=submit]")
            expect(page.locator("#keyShow")).to_be_visible()
            key = page.locator("#keyValue").inner_text().strip()
            assert key.startswith("idx_"), key
            page.fill("#sShop", "Ideal Shoes Agra")
            page.click("#settingsForm button[type=submit]")
            expect(page.locator("#shopName")).to_have_text("Ideal Shoes Agra")

            # public API with the key just created, as the website would call it
            req = urllib.request.Request(f"{base}/api/v1/public/stock", headers={"X-API-Key": key})
            with urllib.request.urlopen(req) as r:
                stock = json.load(r)
            assert len(stock["items"]) == 3, stock
            body = json.dumps({"id": "11111111-2222-4333-8444-555555555555", "sku": "IDEA-DMSBOOT-BLA-10", "type": "out", "delta": -1, "note": "Web order IDX-TEST", "ref": "order-1"}).encode()
            req = urllib.request.Request(f"{base}/api/v1/public/movements", data=body, method="POST", headers={"X-API-Key": key, "content-type": "application/json"})
            with urllib.request.urlopen(req) as r:
                assert json.load(r)["item"]["qty"] == 1

            # ---- staff login on a second device: can sell, no admin tab ----------
            page.click("#logoutBtn")
            expect(page.locator("#gate-login")).to_be_visible()
            page.click("#people button[data-name='Raju']")
            for d in "1234":
                page.click(f"#pinpad button[data-k='{d}']")
            expect(page.locator("#app")).to_be_visible(timeout=10000)
            expect(page.locator("#tab-admin")).to_be_hidden()
            page.fill("#codeInput", "IDEA-DMSBOOT-BLA-10")
            page.click("#codeGo")
            expect(page.locator("#shQty")).to_have_text("1")
            expect(page.locator("#shEdit")).to_be_hidden()

            # wrong PIN message
            page.click("#shClose")
            page.click("#logoutBtn")
            page.click("#people button[data-name='Papa']")
            for d in "0000":
                page.click(f"#pinpad button[data-k='{d}']")
            expect(page.locator("#pinMsg")).to_contain_text("Wrong PIN")

            # ---- desktop width renders the rail -----------------------------------
            desk = browser.new_context(viewport={"width": 1280, "height": 800})
            dpage = desk.new_page()
            dpage.goto(base)
            expect(dpage.locator("#gate-login")).to_be_visible()
            dpage.click("#people button[data-name='Papa']")
            for d in "2468":
                dpage.click(f"#pinpad button[data-k='{d}']")
            expect(dpage.locator("#app")).to_be_visible(timeout=10000)
            dpage.click("#tab-stock")
            expect(dpage.locator("#stockRows tr")).to_have_count(3)
            dpage.screenshot(path=str(ROOT / "e2e" / "last-desktop.png"))
            dpage.click("#tab-dash")
            expect(dpage.locator("#chTrend svg")).to_be_visible()
            dpage.screenshot(path=str(ROOT / "e2e" / "last-desktop-insights.png"), full_page=True)
            page.screenshot(path=str(ROOT / "e2e" / "last-phone.png"), full_page=False)

            # ---- live camera scanning: a fake webcam pointed at a label's QR ----------
            # Draw the QR the Labels tab prints (<appUrl>/#<SKU>, same vendored generator) into a JPEG
            # frame and give it to Chromium as the camera. The app must decode it from live video.
            frame = dpage.evaluate("""(text) => {
              const qr = window.qrcode(0, "M"); qr.addData(text); qr.make();
              const n = qr.getModuleCount(), cell = 8, c = document.createElement("canvas");
              c.width = 640; c.height = 480;
              const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 640, 480); g.fillStyle = "#000";
              const x0 = (640 - n * cell) / 2, y0 = (480 - n * cell) / 2;
              for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect(x0 + k * cell, y0 + r * cell, cell, cell);
              return c.toDataURL("image/jpeg", 0.92).split(",")[1];
            }""", f"{base}/#IDEA-DMSBOOT-BLA-9")
            mjpeg = pathlib.Path(data) / "label.mjpeg"
            mjpeg.write_bytes(base64.b64decode(frame) * 30)
            cam = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", f"--use-file-for-fake-video-capture={mjpeg}"])
            cctx = cam.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, permissions=["camera"])
            cpage = cctx.new_page()
            cpage.on("pageerror", lambda e: errors.append(str(e)))
            cpage.goto(base)
            cpage.click("#people button[data-name='Papa']")
            for d in "2468":
                cpage.click(f"#pinpad button[data-k='{d}']")
            expect(cpage.locator("#app")).to_be_visible(timeout=10000)
            cpage.click("#scanStart")
            expect(cpage.locator("#scanVideo")).to_be_visible()
            expect(cpage.locator("#sheet")).to_be_visible(timeout=15000)
            expect(cpage.locator("#shSku")).to_have_text("IDEA-DMSBOOT-BLA-9")
            expect(cpage.locator("#scanMsg")).to_be_hidden()
            cam.close()

            # Expected noise: the deliberate offline sale and the deliberate wrong PIN.
            expected = ("favicon", "sw.js", "ServiceWorker", "ERR_INTERNET_DISCONNECTED", "401 (Unauthorized)")
            real_errors = [e for e in errors if not any(x in e for x in expected)]
            if real_errors:
                failures.append("browser errors: " + " | ".join(real_errors[:5]))
            browser.close()
    except AssertionError as e:
        failures.append(f"assertion: {e}")
    except Exception as e:  # noqa: BLE001
        failures.append(f"{type(e).__name__}: {e}")
    finally:
        server.terminate()
        try:
            out = server.communicate(timeout=5)[0]
        except subprocess.TimeoutExpired:
            server.kill()
            out = server.communicate()[0]
        if failures:
            print("---- server log (tail) ----")
            print("\n".join(out.splitlines()[-30:]))
        shutil.rmtree(data, ignore_errors=True)
    if failures:
        print("E2E FAILED")
        for f in failures:
            print(" -", f)
        return 1
    print("E2E OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
