# NEXT-STEPS — What only you can do

Everything in this list activates code that is **already written**. Once you complete a step, restart the stack and the feature works.

---

## 1. Razorpay account (priority 1 — blocks checkout)

1. Sign up at https://razorpay.com → KYC with PAN + business proof.
2. Dashboard → Settings → API Keys → **Generate Test Keys**.
3. Dashboard → Settings → Webhooks → **Add Webhook**:
   - URL: `https://yourdomain.com/api/payments/razorpay/webhook` (or `http://localhost:8000/payments/razorpay/webhook` for local dev with `ngrok`).
   - Events: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed`.
   - Generate secret.
4. Paste into `.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxx
   ```
5. Restart: `pnpm stack:up`.
6. Place a test order → use Razorpay test cards (e.g., `4111 1111 1111 1111` / any CVV / future date) → invoice PDF is generated.

When ready for production: KYC live → switch to `rzp_live_*` keys.

---

## 2. MSG91 (phone OTP login)

1. Sign up at https://msg91.com → verify mobile + email.
2. Create a transactional SMS template for OTP (must be DLT-approved per TRAI rules — takes 2-3 days):
   - Sample: `Your IDEALX OTP is ##OTP##. Valid for 10 minutes.`
3. Get **Auth Key** from dashboard → Account → API.
4. Approve a 6-character **Sender ID** (alphanumeric).
5. `.env`:
   ```
   MSG91_AUTH_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
   MSG91_SENDER_ID=IDEALX
   MSG91_TEMPLATE_OTP=<template_id_from_msg91>
   OTP_DEV_MODE=false
   ```
6. Restart. Phone-OTP login (storefront `/login` → "Phone" tab) sends real SMS.

Until then: `OTP_DEV_MODE=true` logs the OTP to the API container stdout.

---

## 3. Domain + production host

Follow **[docs/DEPLOY.md](docs/DEPLOY.md)**: a 2 CPU / 4 GB Ubuntu server, three DNS A records
(`@`, `www`, `stock`), `sh scripts/prod.sh init`, `sh scripts/prod.sh up -d --build`. HTTPS
certificates are issued and renewed by Caddy automatically; there is no certbot step.

---

## 4. GST identity (for compliant invoices)

Fill in `.env`:

```
SELLER_GSTIN=09AAAAA0000A1Z5                  # from the CA; starts with 09 for Uttar Pradesh
SELLER_LEGAL_NAME=Ideal Shoes
SELLER_TRADE_NAME=IDEALX
SELLER_STATE_CODE=09                         # 2-digit code, first 2 of GSTIN
SELLER_ADDRESS_JSON={"line1":"<shop address>","line2":"","city":"Agra","state":"Uttar Pradesh","pincode":"<pincode>","country":"India"}
SELLER_EMAIL=accounts@yourdomain.com
SELLER_PHONE=+919876543210
SELLER_FINANCIAL_YEAR=2025-26                # change annually in April
```

After change: restart API. Every new invoice picks up the new identity.

**Note:** `SELLER_FINANCIAL_YEAR` controls invoice number prefix and reset. Change every 1st April.

---

## 5. Product photography

Minimum to look professional:

- 10 SKUs: start with the two service boots and the two Oxfords in black and dark brown, then the field jacket, then the messenger bag.
- 4 angles each: front, side, 3/4, sole/detail.
- 2000×2000px square, white or transparent background.
- ~200KB each (use https://squoosh.app to compress).

Upload via admin: `/admin/products/<id>/images`. First image = card image. Storefront and B2B catalog show them immediately.

Home-page hero: set `NEXT_PUBLIC_HERO_IMAGE_URL` in `.env` to the public URL of one lifestyle photo (2000px wide, ~300KB) and restart the web container.

**Lifestyle shots** (a boot on the last with the factory floor behind it, a worker lasting an upper) belong on the home page hero (see the `NEXT_PUBLIC_HERO_IMAGE_URL` note above).

---

## 6. 3D models for AR

Per AR-enabled product:

1. Generate `.glb` using one of:
   - **Polycam** (free iPhone/Android app) — photograph the boot or shoe from 30+ angles, app generates `.glb`.
   - **Kiri Engine** (free, similar).
   - **Blender** (free, manual) — for higher fidelity, hire a 3D artist on Fiverr (₹2-5k per model).
2. Optimize: aim for <2MB, <50k triangles. Use https://gltf.report to inspect/optimize.
3. Upload via admin: `/admin/products/<id>/ar-model`.
4. AR viewer at `/ar/<product-slug>` automatically picks it up.
5. iOS users get Quick Look AR, Android users get ARCore Scene Viewer — no extra work.

**Skip 3D entirely** if not ready — the product page hides the AR button gracefully.

---

## 7. NIC IRP e-invoicing (only if turnover > ₹5 cr)

This is **mandatory** for businesses with aggregate turnover > ₹5 cr in any prior FY since 2017-18.

1. Choose a GSP (GST Suvidha Provider): **ClearTax**, **Masters India**, **Cygnet**, **TaxPro** — pricing varies.
2. Onboard with the GSP → they provision NIC IRP sandbox + production credentials.
3. `.env`:
   ```
   IRP_ENABLED=true
   IRP_BASE_URL=https://einv-api.nic.in
   IRP_USERNAME=...
   IRP_PASSWORD=...
   IRP_CLIENT_ID=...
   IRP_CLIENT_SECRET=...
   ```
4. Every new invoice automatically gets IRN + signed QR + ack_no. Cancellation flow exists (24-hour window).

**If turnover < ₹5 cr:** leave `IRP_ENABLED=false`. Invoices are still GST-compliant, just without the IRN.

---

## 8. Tender email inbox

1. Create a dedicated mailbox: `tenders@yourdomain.com` (Google Workspace / Zoho Mail).
2. Enable IMAP access.
3. `.env`:
   ```
   TENDER_INBOX_HOST=imap.gmail.com
   TENDER_INBOX_PORT=993
   TENDER_INBOX_USER=tenders@yourdomain.com
   TENDER_INBOX_PASS=<app-password>          # Gmail requires an app password
   TENDER_INBOX_TLS=true
   ```
4. Email parser polls every 30 minutes (Celery beat) → new mails appear in `/admin/tenders` with parsed metadata.

Forward RFQs from your existing mailbox to this address for automatic ingestion.

---

## 9. Shipping (Shiprocket / Delhivery)

1. Sign up for **Shiprocket** (https://shiprocket.in) — easier integration, supports 17+ couriers from one panel.
2. Get email + password (or generate API token).
3. `.env`:
   ```
   SHIPROCKET_EMAIL=ops@yourdomain.com
   SHIPROCKET_PASSWORD=...
   ```
4. From `/admin/orders/<id>` → click **Generate AWB** → courier label downloadable.

---

## 10. WhatsApp Business API (optional, Phase 2)

1. Meta Business account → Apps → Create app → WhatsApp Business product.
2. Verify business (takes 2-7 days), then add a phone number.
3. Submit message templates for order updates: `order_confirmed`, `order_shipped`, `order_delivered`, `payment_received`.
4. `.env`:
   ```
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_ACCESS_TOKEN=...
   WHATSAPP_VERIFY_TOKEN=<your-pick>
   ```
5. Order events automatically send WhatsApp messages once configured.

---

## Quick checklist

- [ ] Razorpay test keys in `.env`
- [ ] MSG91 keys + DLT-approved template
- [ ] Domain registered + DNS pointed
- [ ] Production VPS provisioned, Docker installed
- [ ] DNS A records for `@`, `www` and `stock` point at the server (Caddy then issues TLS by itself)
- [ ] `SELLER_*` GST identity filled
- [ ] 10 SKUs photographed and uploaded
- [ ] At least 3 `.glb` models uploaded (optional but high-impact)
- [ ] NIC IRP credentials (if turnover > ₹5 cr)
- [ ] Shiprocket account active
- [ ] Tender email inbox configured
- [ ] WhatsApp Business templates approved (Phase 2)
