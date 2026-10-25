# Putting Stock Room online

**Running the shop too?** Follow [docs/DEPLOY.md](../../docs/DEPLOY.md) instead: it puts the shop
(idealx.in) and Stock Room (stock.idealx.in) on one server. Come back here for steps 6–8 (owner,
staff, labels) and 10 (rclone). The script commands below (`backup-offsite.sh`, `restore.sh`,
`restore-drill.sh`) work in both setups.

This guide sets up Stock Room on its own and takes you from nothing to staff scanning boxes on their phones. Follow it top to bottom the first time. Copy the grey command boxes exactly; anything in `<angle brackets>` is yours to fill in.

You will need about an hour, a credit/debit card for the server, and access to the domain's DNS settings (wherever `idealx.in` was bought).

## 1. Get a server

Any always-on Linux machine works. The simplest is a small cloud server (VPS):

- **Size**: 1 CPU, 1 GB RAM, 20 GB disk is plenty (about ₹400–800/month at DigitalOcean, Hetzner, Hostinger, AWS Lightsail and similar). Pick a data centre in India (Mumbai or Bangalore) if offered.
- **System**: Ubuntu 24.04 LTS.
- Note the server's **IP address** (e.g. `203.0.113.10`) and how to log in (a root password or an SSH key).
- If the provider has its own firewall, allow incoming **TCP 22, 80 and 443** (and UDP 443).

**Shop PC instead of a VPS?** It works the same way with Ubuntu installed, but phones outside the shop cannot reach it unless the shop has a fixed public IP and port forwarding. The easier route is [Tailscale](https://tailscale.com) on the PC and every phone: then use the PC's Tailscale name in step 4 and skip step 2. Shop Wi-Fi only also works with the PC's LAN address (README, "Shop-LAN only").

## 2. Point the address at the server

In your domain's DNS settings, add one record:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `stock` | `<server IP>` | default |

That makes `stock.idealx.in` lead to the server. It can take from a few minutes to an hour. Check from any computer:

```bash
nslookup stock.idealx.in
```

It should print the server's IP. Do not continue to step 5 until it does; the HTTPS certificate needs it.

## 3. Install Docker and the app

Log in to the server (on Windows use PowerShell; on Mac use Terminal):

```bash
ssh root@<server IP>
```

Then, on the server:

```bash
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh
git clone https://github.com/Kaustubh1235/ideal_shoes.git /opt/ideal_shoes
cd /opt/ideal_shoes
git checkout idealx-rebrand      # the branch with Stock Room; skip once it is merged into main
cd apps/inventory
```

Every later command in this guide is run from `/opt/ideal_shoes/apps/inventory`.

## 4. Settings (.env)

```bash
cp .env.example .env
nano .env
```

Set these, then save with Ctrl+O, Enter, Ctrl+X:

| Setting | What to put |
| --- | --- |
| `DOMAIN` | `stock.idealx.in`. On a shop PC: its Tailscale name, or its fixed LAN address such as `192.168.1.50` (see the LAN note in [README.md](README.md#run-it-owners-guide)). |
| `APP_SECRET` | Recommended. Run `openssl rand -base64 48` and paste the result. Keeps staff signed in and the AI key readable if you ever move to a new server. Never share it. |
| `METRICS_TOKEN` | Optional. Any long random text; then `/metrics` needs it. |

Leave `APP_VERSION` alone; the update script sets it.

## 5. Start it

```bash
sh scripts/update.sh
```

The first run downloads and builds for a minute or two. Then check:

```bash
docker compose ps
```

`app` should say **healthy** (give it 30 seconds) and `caddy` **Up**. Then:

```bash
curl -s https://stock.idealx.in/healthz
```

should print something like `{"ok":true,"version":"0.1.0+1a2b3c4",...}`. If it does not, see [If the certificate fails](#if-the-certificate-fails).

The app restarts by itself after a reboot or a crash. Logs are capped at 50 MB per service.

## 6. First visit: the owner account

On your phone or computer, open **https://stock.idealx.in** (use exactly this address: the first visit saves it as the address printed inside every QR label).

The first screen is **Set up the Stock Room**: fill in the shop name, your name and a PIN of 4 to 8 digits (twice), and press **Create and open**. You are the admin.

Then go to **Admin → Settings** and check that *This app's address* shows `https://stock.idealx.in`. Fix it and press **Save settings** if not.

## 7. Add staff

**Admin → People · who can use this**: type the person's name and a PIN, keep the role **staff**, press **Add person**. Give them the PIN in person.

On each staff phone:

1. Open `https://stock.idealx.in`.
2. Install it. Android: Chrome menu → *Install app* (or *Add to Home screen*). iPhone: **Safari** → Share → *Add to Home Screen*.
3. Open it from the home screen, tap their name, enter the PIN.

Staff can scan, sell, count and add stock. Only admins see Admin and can change prices or delete items. Five wrong PINs lock that person out for 10 minutes; **New PIN** next to their name unlocks them at once. **Deactivate** takes away access immediately (for example when someone leaves).

## 8. Print the first label sheet

1. **Add**: type the brand (e.g. IDEALX), article (e.g. DMS Boot), colour, choose the type, cost, MRP and rack, then the number of pairs in each size. Press **Add**. Each size becomes its own code like `IDEA-DMSBOOT-BLA-9`.
2. **Labels**: tick the items (or **Select all shown**), choose how many copies (one per pair in stock, or 1 or 2 per code), and press **Print**.
3. In the print window choose **A4**, scale **100% / Actual size**, margins **Default**, and turn off headers and footers. A sheet holds 36 labels of 46 × 30 mm (4 across, 9 down).
4. Print the first sheet on plain paper and hold it against the label sheet to check it lines up, then print on labels.
5. Stick a label on one box, open **Scan → Start camera** on a phone and point it at the label. The item should open. Scanning it with the phone's ordinary Camera app also works (it opens the item in the browser).

The phone notes in [README.md](README.md#phones-installing-and-the-camera) explain the camera on iPhone and Android, and what happens offline.

## 9. Link the website

1. **Admin → API keys · for the website and AI agents**: name it `Website`, Access **Read + write**, press **Create key**.
2. Press **Copy**. The key is shown only once. If you lose it, revoke it and make a new one.
3. In the website's `.env` set:

   ```
   INVENTORY_API_URL=https://stock.idealx.in
   INVENTORY_API_KEY=<the key>
   INVENTORY_APP_URL=https://stock.idealx.in
   ```

   and restart the website. From then on the site fetches stock every 15 minutes and records one sale here for every item in a paid web order. The website's side is described in `docs/GO-LIVE.md` at the top of the repository.

4. Back in **Admin → API keys**, the `Website` key's *last used* time starts updating once the site connects.

## 10. Backups off the machine

The app already saves a backup every day into `./backups/` on the server and keeps the newest 14. Those are lost if the server is, so also copy one to Google Drive every night.

**Install rclone** on the server:

```bash
curl https://rclone.org/install.sh | bash
```

**Connect Google Drive** (once). The server has no browser, so you finish the sign-in on your own computer:

```bash
rclone config
```

Answer: `n` (new remote) → name `gdrive` → storage type: type `drive` → client_id and client_secret: press Enter → scope: choose **drive.file** ("access to files created by rclone only") → service_account_file: Enter → advanced config: `n` → "Use web browser to automatically authenticate?": **`n`**. It prints a command starting with `rclone authorize "drive"`. On your own computer [install rclone](https://rclone.org/downloads/), run that command, sign in with the shop's Google account, and paste the long code it prints back into the server. Then shared drive: `n`, and `y` to keep the remote, `q` to quit.

**Test it:**

```bash
sh scripts/backup-offsite.sh
rclone ls gdrive:StockRoom
```

You should see one `stockroom-<date>.db` file. It is also visible in Google Drive in a folder called StockRoom. Keep that folder private: it holds the whole stock database.

**Every night at 02:30**:

```bash
crontab -e
```

Add this line at the bottom, save and exit:

```cron
30 2 * * * cd /opt/ideal_shoes/apps/inventory && sh scripts/backup-offsite.sh >> backups/offsite.log 2>&1
```

Copies older than 90 days are removed from Drive automatically. Check `backups/offsite.log` now and then.

**Restore drill** (now, and every few months): proves a backup actually opens, without touching the live app:

```bash
sh scripts/restore-drill.sh
```

It should end with `OK: restore works and the counts match.`

## 11. Updating

```bash
cd /opt/ideal_shoes/apps/inventory
sh scripts/update.sh
```

That pulls the new code, rebuilds and restarts in under a minute. Stock, staff and backups are kept. The version at the top of the app (under the shop name, e.g. `v0.1.0+1a2b3c4`) shows which build a phone is running. Phones pick up the new version after the app is closed and opened again (sometimes twice).

## 12. Restoring a backup

Only if the data is wrong or lost. Pick the backup from **before** the problem:

```bash
ls backups/                                       # backups on this server, newest last
sh scripts/restore-drill.sh backups/<file>.db     # optional: check it first
sh scripts/restore.sh backups/<file>.db
```

The script first saves the current database (it prints where, so you can undo), stops the app for a few seconds, puts the backup in place and checks that the app is healthy again. Anything recorded after that backup was taken is gone, so re-enter it or do a count.

**Server lost?** Set up a new one with steps 1–5 (same `APP_SECRET` if you saved it), download the newest file from the StockRoom folder on Google Drive into `./backups/` (`rclone copy gdrive:StockRoom/<file>.db backups/`), then run `restore.sh` as above. Staff sign in again with their usual PINs. If `APP_SECRET` was not the same, re-enter the AI key under **Admin → Insights · AI provider**.

## If the certificate fails

Symptoms: the browser says the connection is not private or cannot connect, or `curl https://stock.idealx.in/healthz` fails. Look at what Caddy says:

```bash
docker compose logs caddy | tail -40
```

Usual causes, in order:

1. **DNS is not pointing here yet.** `nslookup stock.idealx.in` must show this server's IP. Fix the A record, wait, then `docker compose restart caddy`.
2. **Ports 80/443 are blocked.** Open TCP 80 and 443 in the provider's firewall (step 1). Let's Encrypt has to reach port 80 or 443 from the internet.
3. **Typo in `DOMAIN`.** Check `.env`, then `docker compose up -d`.
4. **Too many failed tries.** After repeated failures Let's Encrypt makes you wait about an hour. Fix the cause and leave it; Caddy keeps retrying by itself.

Renewal is automatic; there is nothing to do every 90 days.

## Checking on it

- **Is it up?** `https://stock.idealx.in/healthz` returns `"ok":true`. Point any free uptime monitor (UptimeRobot, Better Stack) at it.
- **Logs**: `docker compose logs -f app` (every API request, one line each). Admin → Backup & activity shows who did what.
- **Numbers**: `/metrics` (Prometheus format: items, units, value, requests, rate-limited requests).
- **Too many sign-in tries**: more than 20 PIN attempts in 10 minutes from one network are refused for a while (the message says to wait a few minutes). The website's API key gets 600 requests a minute.
