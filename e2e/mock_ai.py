"""Test-only stand-in for an AI provider (OpenAI-compatible /chat/completions, as Gemini serves it).

Answers every request with the rows of a real challan from the shop, so the whole stack's
bill-photo flow can be tested without a key or the internet. Used by e2e/compose.e2e.yml.
"""
import http.server
import json
import os
import threading

# e2e/bills_e2e.py sets the model to "bills-e2e": then the answers in e2e/bills/answers.json
# (one AI reply per bill photo, in order) are served one per request instead of the fixed challan.
ANSWERS = "/e2e/bills/answers.json"
queue = {"mtime": None, "items": [], "i": 0}
lock = threading.Lock()


def next_answer() -> str | None:
    with lock:
        if not os.path.exists(ANSWERS):
            return None
        m = os.path.getmtime(ANSWERS)
        if m != queue["mtime"]:
            queue.update(mtime=m, items=json.load(open(ANSWERS, encoding="utf-8")), i=0)
        if queue["i"] >= len(queue["items"]):
            return None
        queue["i"] += 1
        return queue["items"][queue["i"] - 1]

CHALLAN = {
    "kind": "in", "supplier": "Meenu", "billNo": "", "date": "2026-07-21", "total": 17040, "notes": "",
    "lines": [{"text": "48 OP AirMix 355 17040", "qty": 48, "brand": "OP", "article": "AirMix", "colour": "", "size": "", "rate": 355, "amount": 17040}],
}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0)) or 0) or b"{}")
        has_image = any(part.get("type") == "image_url" for m in body.get("messages", []) for part in (m.get("content") if isinstance(m.get("content"), list) else []))
        ok = self.path.endswith("/chat/completions") and self.headers.get("authorization", "").startswith("Bearer ") and has_image
        text = (next_answer() if body.get("model") == "bills-e2e" else None) or json.dumps(CHALLAN)
        reply = {"choices": [{"message": {"content": text}}]} if ok else {"error": "bad request"}
        data = json.dumps(reply).encode()
        self.send_response(200 if ok else 400)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
