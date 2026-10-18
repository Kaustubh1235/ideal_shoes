# GO-LIVE — Razorpay, WhatsApp, and the inventory link

Plain-English steps for the owner, with the developer bits in code blocks. Each section says what the
code does today, so nothing here promises a feature that is not built.

The site's only connections to the outside are: Razorpay (payments), MSG91 (OTP SMS, see
`NEXT-STEPS.md` §2), Meta WhatsApp (order messages), Shiprocket (not wired yet, see §4), and the
**inventory app** (the shop's stock system). Everything else runs inside the Docker stack.

---

## 1. Razorpay (payments) — blocks checkout until done

**What the code does:** the storefront opens Razorpay Checkout for a paid order; Razorpay calls our
webhook; on `payment.captured` the order is marked paid, the invoice is generated, the inventory app is
told the stock has left, and the customer gets a WhatsApp confirmation (when §2 and §3 are set up).

1. Sign up at https://razorpay.com with the business PAN, GSTIN and bank account. KYC takes a few days.
2. Dashboard → **Settings → API Keys → Generate Test Keys**. Keep both values.
3. Dashboard → **Settings → Webhooks → Add Webhook**:
   - URL: `https://<your-domain>/api/v1/payments/razorpay/webhook`
     (nginx forwards this to the API; for local testing expose the API with `ngrok http 8000` and use
     `https://<ngrok-id>.ngrok.app/payments/razorpay/webhook`).
   - Events to tick: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`,
     `refund.created`, `refund.processed`.
   - Set a **webhook secret** and keep it.
4. Put the three values in `.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxx
   ```
5. Restart: `docker compose -f infra/docker/compose.yml up -d --force-recreate web api worker`.
6. Place a test order on the storefront and pay with Razorpay's test card `4111 1111 1111 1111`, any
   future expiry, any CVV. Check: Admin → Orders shows the order as **paid**; the invoice PDF appears on
   the order; the API log shows `inventory.order_out` (or `inventory.order_out.skipped` until §3 is done).
7. Going live: complete KYC, Dashboard → **Generate Live Keys**, replace `rzp_test_*` with `rzp_live_*`,
   recreate the webhook with the live secret, restart. Do one real ₹1 order and refund it from the
   Razorpay dashboard to see `refund.*` land.

The webhook fails closed: with no `RAZORPAY_WEBHOOK_SECRET`, every webhook is rejected and no order is
marked paid.

---

## 2. WhatsApp Business (order messages) — optional, 1–2 weeks of Meta approvals

**What the code does today:** one message is sent, the `order_confirmed` template, when a payment is
captured. The other three templates below are registered in code (`apps/api/app/services/whatsapp/client.py`)
but nothing sends them yet; wiring `order_shipped` and `order_delivered` needs the shipment flow in §4.
Until the two env vars are set, every send is only a log line.

1. Create a Meta Business account at https://business.facebook.com and complete **Business
   verification** (GST certificate and a utility bill or bank statement in the business name; 2–7 days).
2. https://developers.facebook.com → **Create App → Business → add the WhatsApp product**.
3. Under WhatsApp → **API Setup**, add a phone number for the business (a number not already on a
   personal WhatsApp account). Note the **Phone number ID**.
4. Create a **System User** (Business Settings → Users → System users), give it the WhatsApp app with
   `whatsapp_business_messaging` and `whatsapp_business_management` permissions, and generate a
   **permanent access token**. (The token shown on the API Setup page expires in 24 hours; do not use it
   in `.env`.)
5. Under WhatsApp → **Message templates**, create these four, category **Utility**, language English
   (add Hindi copies later if you like). The names must match exactly and the number of `{{n}}`
   variables must match:

   | Template name | Body text to submit |
   | --- | --- |
   | `order_confirmed` | Hi {{1}}, we have received your IDEALX order {{2}} for ₹{{3}}. We will message you when it ships. |
   | `order_shipped` | Your IDEALX order {{1}} has shipped. Track it here: {{2}} |
   | `order_delivered` | Your IDEALX order {{1}} was delivered. If the fit isn't right, exchange within 30 days: {{2}} |
   | `payment_received` | Payment of ₹{{1}} received for IDEALX order {{2}}. Thank you. |

   Approval usually takes minutes to a day.
6. `.env`:
   ```
   WHATSAPP_PHONE_NUMBER_ID=<phone number id from step 3>
   WHATSAPP_ACCESS_TOKEN=<permanent system-user token from step 4>
   WHATSAPP_VERIFY_TOKEN=<any string you choose; reserved for inbound webhooks, unused today>
   ```
7. Restart `api` and `worker`. Pay a test order with your own number on the account; you should receive
   the `order_confirmed` message within a minute. If not: `docker compose logs worker | grep whatsapp`
   shows `not_configured`, `no_phone`, `param_count_mismatch` or the Meta error body.

Customers only get messages if they logged in with a phone number (the OTP login), since that is the
number we send to.

---

## 3. Inventory link — the stock room talks to the site

**What the code does:** every 15 minutes the worker pulls stock levels from the inventory app and sets
`inventory.on_hand` on this site for every variant whose **SKU or barcode** equals the inventory app's
SKU (a `stock_movements` row with reason `adjustment` and note "Synced from inventory app" records each
change). When a web order is paid, the worker posts one stock-out movement per order item to the
inventory app, keyed by the order item id so a repeated webhook can never double-count. The admin
sidebar gets a **Stock room** link that opens the inventory app in a new tab. That is the whole
integration; nothing else on the site reads or writes the inventory app.

1. In the inventory app (as the owner): **Admin → API keys → New key**, name it `Website`, scopes
   **read** and **write**. Copy the key; it is shown once.
2. `.env` on the site:
   ```
   INVENTORY_API_URL=https://stock.idealx.in        # the inventory app's HTTPS address, no trailing slash
   INVENTORY_API_KEY=<the key from step 1>
   INVENTORY_APP_URL=https://stock.idealx.in        # used only for the "Stock room" link in /admin
   ```
3. Make the SKUs line up. The inventory app's SKU for a pair must equal either the variant **SKU** or
   the variant **barcode** on this site (Admin → Products → variant). Easiest: paste the inventory
   app's SKU into the variant's barcode field. Matching ignores case and spaces.
4. Restart `api`, `worker` and `web`.
5. Verify:
   - Trigger a sync now instead of waiting 15 minutes:
     ```
     docker compose -f infra/docker/compose.yml exec worker \
       celery -A app.worker.celery_app call inventory.sync_stock
     ```
     then `docker compose logs worker | grep inventory.sync` shows
     `inventory.sync.done` with `matched`, `changed` and `unmatched` counts. `unmatched_sample` lists
     inventory SKUs that have no variant here (fix step 3 for the ones that should sell online).
   - Admin → Inventory shows the synced **On Hand** numbers.
   - Pay a test order (§1 step 6), then open the inventory app: the item shows a movement
     "Web order IDX-…" and its quantity is lower by the ordered amount.
6. If the inventory app is down, nothing breaks on the site: the sync task logs an error and retries on
   the next tick; the order stock-out task retries with backoff up to five times. Orders still get paid
   and invoiced.

The site never changes prices, items or anything else in the inventory app, and the inventory app never
needs to reach the site.

---

## 4. Shiprocket (shipping) — not wired yet

`.env` has `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD`, but no code calls Shiprocket today: shipments in
Admin → Shipments are recorded by hand. When you are ready, sign up at https://shiprocket.in, generate
an API user (Settings → API → Create API user) and we add the AWB generation call to the shipment flow;
that is also when `order_shipped` / `order_delivered` WhatsApp templates get wired.

---

## 5. Checklist

- [ ] Razorpay test keys and webhook secret in `.env`; test card order shows **paid** in Admin
- [ ] Razorpay live keys after KYC; one ₹1 live order and refund seen in the dashboard
- [ ] Meta Business verified; WhatsApp number added; four templates approved
- [ ] `WHATSAPP_PHONE_NUMBER_ID` + permanent `WHATSAPP_ACCESS_TOKEN` in `.env`; test order message received
- [ ] Inventory app API key created (read + write); `INVENTORY_API_URL` / `INVENTORY_API_KEY` / `INVENTORY_APP_URL` set
- [ ] Variant SKUs or barcodes match the inventory app's SKUs; `inventory.sync.done` shows `unmatched: 0` for everything sold online
- [ ] Admin sidebar shows **Stock room** and it opens the inventory app
- [ ] `NEXT_PUBLIC_HERO_IMAGE_URL` set to the factory photo (see `NEXT-STEPS.md` §5)
- [ ] `SELLER_GSTIN`, `SELLER_ADDRESS_JSON` (Agra), `SELLER_STATE_CODE=09`, `SELLER_EMAIL`, `SELLER_PHONE` filled
