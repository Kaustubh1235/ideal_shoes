# Putting IDEALX online

One server runs everything: the shop at **idealx.in** (storefront, dealer portal, /admin) and
**Stock Room** at **stock.idealx.in** (scan, count, labels, Excel). Follow this top to bottom the
first time. Copy the grey boxes exactly; anything in `<angle brackets>` is yours to fill in.

You need about two hours, a card for the server, and access to the domain's DNS settings.
Accounts you fill in later (Razorpay, MSG91, Meta WhatsApp, email) are in
[GO-LIVE.md](GO-LIVE.md); the site runs without them, those features are simply off.

## 1. Server

- **Size**: 2 CPU, 4 GB RAM, 40 GB disk (Hetzner CPX21, DigitalOcean 4 GB, AWS Lightsail 4 GB;
  about ₹1,000–2,000/month). 2 GB RAM works for a quiet shop but building the site needs swap.
  Pick Mumbai or Bangalore if offered.
- **System**: Ubuntu 24.04 LTS. Note the server's **IP address**.
- In the provider's firewall allow incoming **TCP 22, 80, 443** and **UDP 443**. Nothing else.

## 2. DNS

At your domain's DNS settings add three records:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` (idealx.in itself) | `<server IP>` |
| A | `www` | `<server IP>` |
| A | `stock` | `<server IP>` |

Check from any computer: `nslookup stock.idealx.in` must print the server's IP before step 5.

## 3. Docker and the code

```bash
ssh root@<server IP>
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh
git clone https://github.com/Kaustubh1235/ideal_shoes.git /opt/ideal_shoes
cd /opt/ideal_shoes
git checkout idealx-rebrand      # skip once merged into main
```

Every later command runs from `/opt/ideal_shoes`.

## 4. Settings

```bash
sh scripts/prod.sh init      # makes .env with new random passwords and keys
nano .env
```

Set `SITE_DOMAIN=idealx.in` and `STOCK_DOMAIN=stock.idealx.in`, and the **Seller GST identity**
block (GSTIN, legal name, the Agra address as one line of JSON, email, phone). Save with
Ctrl+O, Enter, Ctrl+X. Leave everything marked optional blank for now.

**Copy `.env` somewhere safe** (a password manager). Restoring the site on a new server needs it.

## 5. Start

```bash
sh scripts/prod.sh up -d --build
```

The first build takes 10–20 minutes. Then:

```bash
sh scripts/prod.sh ps
```

All services say `Up` (`healthy` where shown), and `migrate` and `inventory-init` have exited
with code 0. Check from your own computer:

- https://idealx.in shows the shop.
- https://idealx.in/api/v1/healthz prints `{"status":"ok"}`.
- https://stock.idealx.in shows **Set up the Stock Room**.

If a certificate fails, see [Certificates](#certificates).

## 6. The admin account

```bash
sh scripts/prod.sh exec api python scripts/seed_admin.py <you@idealx.in>
```

It asks for a password (12+ characters) and prints a **TOTP secret**. Add it to an
authenticator app (Google Authenticator, Aegis, 1Password: "enter a setup key"). Sign in at
https://idealx.in/login with email, password and the 6-digit code.

Optional: put your office's fixed IP in `ADMIN_IP_ALLOWLIST` in `.env` so /admin only opens
from there, then `sh scripts/prod.sh up -d`.

## 7. Stock Room

Open https://stock.idealx.in **on this exact address** (it becomes the address inside every QR
label), create the owner with a 4–8 digit PIN, then add staff and print labels:
[apps/inventory/DEPLOY.md](../apps/inventory/DEPLOY.md) steps 6–8 explain each screen.
Its Excel buttons are under **Insights → Export** and **Admin → Import from Excel or CSV**.

## 8. Link the shop to Stock Room

1. Stock Room → **Admin → API keys**: name `Website`, access **Read + write**, **Create key**, **Copy**.
2. In `.env` set `INVENTORY_API_KEY=<the key>` (leave `INVENTORY_API_URL` as it is), then
   `sh scripts/prod.sh up -d`.
3. For every product variant sold online, put the Stock Room code from its box label
   (e.g. `IDEA-DMSBOOT-BLA-9`) in **Admin → Products → (product) → Stock Room code**.

Every 15 minutes the shop copies stock levels from Stock Room; every paid web order is recorded
there as a sale. If Stock Room is down the shop keeps selling and catches up afterwards.

## 9. The first products

**Admin → Products → New product**: name, category, HSN (6403 leather footwear, 6201 jackets),
price **including GST**, MRP. Then on the product page: add variants (size, colour, Stock Room
code), **Add a photo** (JPEG/PNG/WebP up to 5 MB, square about 2000 px, the first is the main
photo), and **Publish**. Start with the 10 best sellers. The product page shows the Legal
Metrology declarations (MRP, net quantity, origin, manufacturer, customer care) automatically
from the `SELLER_*` settings.

## 10. Payments, SMS, WhatsApp, email

Each is a block in `.env`; after editing run `sh scripts/prod.sh up -d`. Step-by-step account
setup is in [GO-LIVE.md](GO-LIVE.md):

- **Razorpay** (§1): test keys first; the webhook URL is
  `https://idealx.in/api/v1/payments/razorpay/webhook`. Pay one order with test card
  `4111 1111 1111 1111`, check Admin → Orders shows it paid and the invoice appears. Then switch
  to live keys after KYC, and do one real ₹1-level order and refund.
- **MSG91** (NEXT-STEPS.md §2): until set, phone login says "not available yet"; email login works.
- **WhatsApp** (§2): order confirmations go to the delivery phone number once the template is approved.
- **Email**: any SMTP account (`SMTP_*`); order confirmations go to the email given at checkout.

## 11. Backups

The server keeps Stock Room's nightly backups on its own. For everything, run once to test:

```bash
sh scripts/backup.sh
```

It writes the shop database, all photos and invoice PDFs, and a Stock Room snapshot under
`backups/` and `apps/inventory/backups/`. To also copy them to Google Drive, set up rclone as in
[apps/inventory/DEPLOY.md §10](../apps/inventory/DEPLOY.md#10-backups-off-the-machine)
(remote name `gdrive`), add `RCLONE_REMOTE=gdrive:IDEALX` to `.env`, and schedule it nightly:

```bash
crontab -e
```

```cron
30 2 * * * cd /opt/ideal_shoes && sh scripts/backup.sh >> backups/backup.log 2>&1
```

**Restoring the shop database** (only after data loss; everything since that dump is gone):

```bash
sh scripts/prod.sh stop web api worker beat
sh scripts/prod.sh exec -T postgres pg_restore -U idealx -d idealx --clean --if-exists < backups/site/postgres-<time>.dump
sh scripts/prod.sh up -d
```

Photos and invoices: copy `backups/site/storage/<bucket>` back with the same rclone command the
script uses, swapping source and destination. Stock Room: `cd apps/inventory && sh scripts/restore.sh backups/<file>.db`.

## 12. Updating

```bash
cd /opt/ideal_shoes
git pull --ff-only
sh scripts/prod.sh up -d --build
```

Migrations run by themselves before the API starts. Data is kept.

## Certificates

Caddy gets and renews HTTPS certificates for all three names by itself. If a browser says the
connection is not private: `sh scripts/prod.sh logs caddy | tail -40`. Usual causes: DNS not
pointing here yet (`nslookup`), ports 80/443 closed in the provider firewall, a typo in
`SITE_DOMAIN`/`STOCK_DOMAIN`. Fix it and run `sh scripts/prod.sh restart caddy`.

## Checking on it

- **Uptime**: point a free monitor (UptimeRobot, Better Stack) at
  `https://idealx.in/api/healthz` (the shop and its database),
  `https://idealx.in/api/v1/healthz` (the API) and `https://stock.idealx.in/healthz`.
- **Logs**: `sh scripts/prod.sh logs -f web` (or `api`, `worker`, `caddy`, `inventory`). Each
  service keeps at most 50 MB of logs.
- **Is the stock sync working?** `sh scripts/prod.sh logs worker | grep inventory.sync`.
