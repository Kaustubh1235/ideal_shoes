# Stock Room

The stock system for Ideal Shoes / IDEALX: every box gets a QR label, every sale, delivery and count is one scan on a phone, and the owner sees where the money sits. It runs on your own server, not on the website's hosting, and the website is the only other system that talks to it (through an API key you create).

- **Phones**: open the address once, tap "Add to Home Screen", and it behaves like an app: PIN login, camera scanning, works offline and syncs later.
- **Desktop**: the same address in a browser shows the full dashboard, label printing, admin.
- **One file database** (SQLite) with nightly backups; export everything as CSV at any time.

## What it does

| Area | Details |
| --- | --- |
| Sign-in | Owner sets up on first visit. Staff get a name + PIN. Five wrong PINs lock the account for 10 minutes. Admin can deactivate anyone instantly. |
| Add stock | One article at a time with its whole size run (sizes come from Settings). Existing SKUs are topped up, never duplicated. SKU is generated: `BRAN-ARTICLE-COL-SIZE`. |
| Labels | Select items → Print. A4 sheet of 36 labels (46 × 30 mm) with QR, brand, article, colour, size. The QR holds the app address + SKU, so even the phone's own camera app opens the item. |
| Scan | Live camera scanning (jsQR), photo fallback, or type the code. Opens the item: Sold −1, In +1, Count, other change, edit details (admin). |
| Offline | Sales and counts made without network are queued on the phone and synced when it reconnects, each with an idempotency id so nothing is applied twice. |
| Insights | Units, value at cost, sold vs received per day, ageing buckets, dead stock (180+ days, nothing sold), top sellers, broken size runs, by brand. |
| Ask AI | Configurable provider (Anthropic or any OpenAI-compatible endpoint). The key is stored encrypted on the server; the model only ever sees the stock digest. |
| Public API | `X-API-Key` keys with `read` or `read+write` scope. OpenAPI spec at `/api/v1/public/openapi.json`. Used by the IDEALX website (stock sync, web-order deduction) and by any LLM agent you point at it. |
| Ops | `/healthz`, Prometheus `/metrics`, JSON request logs, audit log of every admin action and API-key movement, nightly `VACUUM INTO` backups (keeps 14), one-click backup download. |
| Security | HTTPS via Caddy (automatic certificates), HttpOnly/Secure/SameSite cookies, CSRF header on every write, argon2id PINs, hashed API keys shown once, strict CSP, no third-party scripts or CDNs. |

## Run it (owner's guide)

You need one Linux machine that is always on: a ₹400–800/month VPS, or a small PC in the shop. Install Docker once (`curl -fsSL https://get.docker.com | sh`).

```bash
git clone <this repo> && cd ideal_shoes/apps/inventory
cp .env.example .env        # set DOMAIN (e.g. stock.idealx.in) and ACME_EMAIL
docker compose up -d
```

Point the domain's DNS A record at the machine, open `https://stock.idealx.in`, and the first screen asks for the owner's name and PIN. Then Admin → People to add staff, Admin → Settings to confirm the app address (it is printed inside every QR), and Add to enter the first article.

**Shop-LAN only, no public domain?** Two good options: install [Tailscale](https://tailscale.com) on the server and the phones and set `DOMAIN` to the server's Tailscale name; or keep `DOMAIN=localhost` and install Caddy's local CA certificate on each phone once (`docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt`). Camera scanning needs HTTPS either way.

## Everyday use

1. **Count a room**: open the app on the phone, Add each article with its sizes from the register (or import the Stock Book CSV under Admin). Print labels. Stick one on every box.
2. **Sale**: scan the box → Sold −1. Delivery: scan → In +1 (or "Other change" with the carton quantity).
3. **Monthly**: scan each box → Count → type what's on the rack. The app records the correction.
4. **Sunday review**: Insights tab. Dead stock is the clearance list; broken size runs are the reorder list.

## Link the website

Admin → API keys → "Website", Read + write → copy the key. In the website's `.env` set `INVENTORY_API_URL=https://stock.idealx.in` and `INVENTORY_API_KEY=<key>`. The site then pulls stock every 15 minutes and posts one `out` movement per paid order item. Details in `docs/GO-LIVE.md` at the repo root.

## For an LLM agent

Create a read-only key and give the agent the OpenAPI spec URL. `GET /api/v1/public/summary` returns the same digest the built-in "Ask AI" uses: totals, ageing, dead stock, top sellers, size gaps, last-30-day flows.

## Develop

```bash
bun install            # nothing to install, kept for habit; the app has zero npm dependencies
bun run dev            # http://localhost:8787 with reload
bun test               # API tests on an in-memory database (~0.5 s)
python3 e2e/run_e2e.py # Playwright: setup → add → scan → sell → count → offline sync → labels → insights → admin
```

Layout: `src/` (Bun + `bun:sqlite`, no framework), `public/` (plain HTML/CSS/JS, PWA, vendored `jsQR` and `qrcode-generator`), `tests/`, `e2e/`, `scripts/import-csv.ts`.

## Backups and restore

Nightly backups land in `./backups/` on the host (and Admin → Download database backup gives one on demand). To restore: stop the stack, copy the chosen `.db` over the `stockroom.db` in the `stockroom-data` volume, start the stack.

## Limits that are fine for a shop and worth knowing

Tens of thousands of SKUs and movements are no problem on SQLite. The dashboard recomputes from all items on each load, which is instant below ~50k SKUs. If the business ever outgrows this (multiple godowns with transfers, manufacturing BOMs), the CSV exports move cleanly into ERPNext.
