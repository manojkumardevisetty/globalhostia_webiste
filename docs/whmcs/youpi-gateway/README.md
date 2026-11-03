# YouPI UPI gateway for WHMCS (GlobalHostia)

A WHMCS 8.13 **Third Party Gateway** module that lets GlobalHostia customers pay INR invoices by UPI through a **self-hosted [YouPI PG V2](https://github.com/youpi-pg/YouPI-PG)** instance. WHMCS stays the billing system of record. YouPI shows the UPI QR and app links, watches the receiving bank account, and sends a signed webhook. This module verifies the webhook and adds the payment to the invoice.

> **Read "Risks and limits" before you switch this on for customers.** YouPI describes itself as an experimental research project. It is not a regulated payment gateway.

---

## What is in the package

```
modules/gateways/youpi.php                 Gateway module: _MetaData, _config, _link
modules/gateways/callback/youpi.php        Webhook receiver (signature, dedupe, apply payment)
modules/gateways/youpi/bootstrap.php       Loads the library
modules/gateways/youpi/.htaccess           Blocks direct HTTP access to library PHP (Apache)
modules/gateways/youpi/lib/                Signature, Config, ApiClient, Store (Capsule), Processor, Reconciler, View, Util
modules/gateways/youpi/assets/             youpi.css, youpi.js (invoice-page button and checkout window)
includes/hooks/youpi_reconcile.php         Cron safety net for missed webhooks
tests/                                     CLI tests (no WHMCS needed) and fixture generator
```

No `_refund` function: YouPI has no refund API. Refunds are made from the receiving bank account and recorded in WHMCS by hand.

## How a payment flows

1. The client opens an unpaid INR invoice and picks **UPI**. `youpi_link()` runs on the WHMCS server.
2. The module creates (or reuses) a YouPI order with `POST /api/v1/payments`, using the merchant API key on the server only. The order id is `WHMCS-<invoiceid>-<8-char nonce>`, stored in `mod_youpi_orders`.
3. The client gets a branded **Pay with UPI** button. On desktop it opens the YouPI checkout in a window on the invoice page. On phones it opens the checkout page itself so UPI app links work. The YouPI checkout shows the QR code and the Google Pay, PhonePe, Paytm and other app buttons.
4. The client pays. The Android observer phone (or Gmail observer) sees the bank's credit alert, and YouPI matches it to the order.
5. YouPI POSTs a signed webhook to `callback/youpi.php`. The module checks the signature, freshness, delivery id, order, UTR, amount and invoice state, then calls `addInvoicePayment()` with the **UTR as the transaction id** and fee 0.
6. Every few minutes the reconciliation hook asks YouPI about orders that are still open, in case a webhook was missed.

Nothing on the browser side marks an invoice paid. Only the signed webhook (or staff) does that.

---

## Install

### 1. Upload

Copy the folders into the WHMCS root, keeping the paths:

```
modules/gateways/youpi.php
modules/gateways/callback/youpi.php
modules/gateways/youpi/            (whole folder)
includes/hooks/youpi_reconcile.php
```

On **nginx** the `.htaccess` file is ignored. Add this inside the WHMCS server block:

```nginx
location ~ ^/modules/gateways/youpi/.*\.php$ { deny all; }
```

### 2. Activate

**Setup > Payments > Payment Gateways > All Payment Methods > YouPI UPI (self-hosted)**. Set the Display Name customers see, for example `UPI (Google Pay, PhonePe, Paytm)`.

### 3. Configure

| Setting | What to enter |
|---|---|
| YouPI API base URL | `https://pay.globalhostia.com`. Must be https. The checkout portal proxies `/api/*` to the payment API, so this can be the same origin as the checkout. |
| Checkout portal URL | `https://pay.globalhostia.com`. Checkout links returned by YouPI must be on this origin, or the module refuses them. |
| Merchant ID | The merchant UUID or slug from YouPI Merchant Admin (sent as `X-Merchant-Id`). |
| Merchant API key | The merchant API key (`yp_live_...` when created, `mk_live_...` after rotation). Sent as `X-Merchant-Key`. Stored by WHMCS and never sent to the browser. |
| Webhook signing secret | The merchant's webhook secret from YouPI. |
| Max webhook age | `300` seconds (default). See "Webhook retries" below. |
| Allow legacy V1 signature | Off. Turn on only if your YouPI build does not send `X-Gateway-Signature-V2`. |
| Mark invoice paid on | `OBSERVED_SUCCESS` (fast) or `RECONCILED only` (safest). See "Confirmation level". |
| Accept only INR invoices | On. Clients billed in another currency see a polite message to pick another method. |
| Minimum / maximum amount (INR) | For example `1.00` and `100000`. Outside this range the UPI option shows a message instead of a button. |
| Hold for manual review above (INR) | For example `5000`. Larger payments are never marked paid automatically. |
| Checkout display | Embedded window, or redirect. Phones always redirect. |
| Test mode | On while testing. Only a staff session (admin "Login as Client") sees the UPI button. |
| Brand name, button label, brand colour | `GlobalHostia`, `Pay with UPI`, `#c5386f`. |
| Billing support URL | Shown when UPI is unavailable. |

### 4. Currency

YouPI only takes INR.

* **Recommended:** keep **Accept only INR invoices** on and bill Indian clients in INR.
* If you bill some clients in another currency and want them to pay by UPI anyway: add INR under **Setup > Payments > Currencies**, set this gateway's **Convert To For Processing** = `INR`, and turn **Accept only INR invoices** off. The module then compares the paid INR amount with the converted invoice balance (1 paisa tolerance) and records the payment in the invoice's own currency. Exchange-rate drift between viewing and paying sends the payment to manual review. This conversion path has not been tested on a live WHMCS.

### 5. Webhook in YouPI

In YouPI Merchant Admin, set the merchant webhook URL to:

```
https://my.globalhostia.com/modules/gateways/callback/youpi.php
```

The webhook secret there must equal the one in WHMCS. The URL must be public https; YouPI refuses private or loopback webhook targets.

### 6. Settings on the YouPI server

In YouPI's `.env`:

```
NODE_ENV=production
CHECKOUT_PUBLIC_URL=https://pay.globalhostia.com
YOUPI_ALLOWED_RETURN_ORIGINS=https://my.globalhostia.com
CHECKOUT_FRAME_ANCESTORS=https://my.globalhostia.com
YOUPI_ALLOWED_ORIGINS=https://my.globalhostia.com
```

* `YOUPI_ALLOWED_RETURN_ORIGINS`: without it, YouPI rejects the invoice return URL. The module then retries without a return URL and writes an Activity Log note.
* `CHECKOUT_FRAME_ANCESTORS`: without it, the embedded window stays blank in production because the checkout sends `frame-ancestors 'self'`. If you cannot set it, use **Checkout display = Redirect**.

### 7. Test before going live

1. Turn **Test mode** on. Log in as a client from the admin area and open a small INR invoice, for example INR 1.00.
2. Pay with a real UPI app. Check that **Billing > Gateway Log** shows `Success`, the invoice is Paid, and the transaction id is the 12-digit UTR from your bank app.
3. Set the review threshold below your test amount, pay again, and check that the invoice stays Unpaid, a staff email arrives, and the invoice shows the "under review" note.
4. Re-send a webhook from YouPI. The Gateway Log should show `Duplicate`.
5. Turn **Test mode** off.

Developer tests run without WHMCS:

```bash
php tests/run-tests.php        # signature verification (YouPI fixtures), order ids, money, config
php tests/processor-sim.php    # pay / hold / duplicate decisions with a stand-in database
node tests/generate-fixtures.mjs   # regenerate tests/fixtures/webhooks.json
```

---

## Hosting YouPI itself

YouPI is a set of long-running Node.js services with a local SQLite database and live connections to an Android phone. It needs a **persistent VPS**, not a serverless host. **Do not deploy it on Vercel.** The GlobalHostia website stays on Vercel; YouPI runs on its own server.

**Server**

* A small Linux VPS (1 to 2 vCPU, 2 GB RAM, SSD) with a static IP. A GlobalHostia VPS is fine. India-region hosting keeps latency low for the phone link.
* **Node.js 24 LTS.** YouPI's README says Node 22.13 or newer works (for `node:sqlite`), but its `package.json` declares `"node": ">=24.22.1"`, so use 24 LTS to avoid surprises.
* SQLite (built in) lives in `data/youpi_pg.sqlite`. Back up `data/` (including `data/.secrets/`) every night and before every upgrade. Keep the backups encrypted, because they hold customer phone numbers and bank alert text.
* Run it with `npm start` under systemd or pm2 so it restarts after crashes and reboots.
* Review YouPI's source before installing. Install dependencies with `npm ci` from its lockfile on the server, not on the WHMCS host.

**Ports** (YouPI defaults)

| Port | Service | Expose? |
|---|---|---|
| 7000 | Checkout portal (also proxies `/api/*`) | **Yes**, through nginx/Caddy with TLS as `https://pay.globalhostia.com` |
| 6100 | Payment API | No. Reached through the portal proxy or localhost. |
| 6001 | Merchant Admin | Not publicly. Use a VPN, SSH tunnel or IP allowlist. |
| 8090 | Control Center (process supervisor) | Never public. |
| 6002 / 6003 | SMS / Gmail observers | Localhost only. |
| 5000, 3000 | Demo store, help portal | Turn off or keep local. |

Only 443 (and 80 for the certificate) should be open on the firewall. The WHMCS server only needs outbound https to `pay.globalhostia.com`, and YouPI needs outbound https to `my.globalhostia.com` for webhooks.

**Android observer phone**

* A dedicated Android phone with the **receiving bank account's SIM** in it, so the bank's credit SMS and app notifications arrive on it.
* Install YouPI's observer APK, check its SHA-256 against the one YouPI publishes, and pair it by scanning the QR code in Merchant Admin.
* Keep it on charge and on Wi-Fi, exclude the app from battery optimisation, and leave notification access on. If the observer heartbeat stops, YouPI refuses new UPI sessions (`503 OBSERVERS_UNHEALTHY`). Customers then see "Our UPI service is briefly offline", and nothing is charged.
* Treat the phone as sensitive: it receives the bank's OTPs. Lock it, encrypt it, and keep it physically secure.

**Customer sign-in on the YouPI checkout:** YouPI asks the customer to verify their mobile number (WhatsApp OTP) before it shows the QR code. This is YouPI's own anti-fraud step and cannot be turned off from WHMCS. Expect one extra step at checkout.

---

## Confirmation level

YouPI produces two different "paid" outcomes:

* **`OBSERVED_SUCCESS`**: a bank SMS, notification or email was parsed and matched to the order. `settlementState` is `NOT_RECONCILED`. This arrives within seconds.
* **`RECONCILED`**: an operator imported a bank-statement CSV in YouPI and a line matched the order's account, amount and 12-digit reference. YouPI has no bank API and no scheduled statement pull, so this happens only when staff import a statement.

YouPI's own merchant guide says: *"Do not fulfill a UPI order on `SUCCESS` or `OBSERVED_SUCCESS`."*

* **Mark invoice paid on = OBSERVED_SUCCESS** (default): invoices are paid within about a minute, and the client sees "Payment is confirmed automatically once your bank confirms it — usually within a minute." The risk is that a wrong or spoofed alert marks an invoice paid without money arriving. The manual-review threshold and a daily check against the bank statement reduce that risk.
* **Mark invoice paid on = RECONCILED only**: nothing is marked paid until someone imports a statement in YouPI. The client is told that payments are checked against the bank statement, usually within one business day. This is safest, but slower and manual.

Whichever you choose, `SUCCESS` (YouPI's COD and counter outcome) is never treated as a UPI payment, and `MANUAL_REVIEW` from YouPI always goes to staff.

## What the webhook checks

For every request to `callback/youpi.php`:

1. POST only, body at most 64 KB, read raw from `php://input`.
2. `X-Gateway-Signature-V2` = `sha256=HMAC_SHA256(secret, "<X-Gateway-Timestamp>.<raw body>")`, compared in constant time. V1 (`HMAC(secret, body)`) is used only when V2 is absent **and** the V1 fallback setting is on.
3. The body's `timestamp` and `deliveryId` must equal the headers, and the timestamp must be within the max age (default 5 minutes).
4. `X-Gateway-Delivery-Id` is recorded in `mod_youpi_deliveries`. A repeat gets `200 duplicate`. If processing fails with an exception the record is removed so YouPI's retry can try again (`500`).
5. `orderId` must match `WHMCS-<invoice>-<nonce>` and exist in `mod_youpi_orders` for that invoice. `checkCbInvoiceID()` is called.
6. `method` must be `UPI`, `currency` `INR`, `amount` and `amountPaise` must agree, and the UTR must be present and well-formed.
7. The UTR must not already exist as a transaction id. If it is on this invoice the delivery is a duplicate. If it is on another invoice the payment is held. Then `checkCbTransID()`.
8. Invoice must be **Unpaid**. Paid amount must equal the order amount **and** the current invoice balance in paise.
9. Above the review threshold: **no payment**. The Gateway Log gets `Held for Review`, staff get an email (`SendAdminEmail`), the Activity Log gets an entry, and the invoice gets a client-visible note ("UPI payment (ref ending 1234) received and under review…").
10. Otherwise `addInvoicePayment(invoice, UTR, amount, 0, 'youpi')`. A row-level claim (`APPLYING`) stops the webhook and the cron from applying the same order twice.

Every outcome is written to **Billing > Gateway Log** with secrets masked and customer contact data removed. Responses: `200` processed, duplicate or ignored; `400` malformed; `401` bad or stale signature; `500` temporary error.

**Webhook retries:** YouPI retries failed deliveries after 5 s, 30 s, 2 min, 10 min and 1 h, and every retry carries the **original** timestamp. With a 5-minute window, retries after about 5 minutes are rejected as stale. The reconciliation hook then picks the order up. Raise **Max webhook age** (up to 7200 s) if you prefer webhook retries to keep working; the delivery-id table still blocks replays.

## Reconciliation hook

`includes/hooks/youpi_reconcile.php` runs on `AfterCronJob` and does a pass at most every 10 minutes:

* It polls `GET /api/v1/payments/{paymentId}` with the merchant key for orders created in the last 72 hours that are still open.
* `FAILED`, `EXPIRED` and `CANCELLED` close the order.
* **Limit:** YouPI's status API does not return the UTR. A paid status found by polling is therefore **not** credited automatically, because there is no unique transaction id. Staff get one email per order saying the invoice may be paid and the webhook was missed. They can add the payment by hand using the UTR from Merchant Admin or the bank statement. If a later YouPI version adds `utr` to that response, the module uses it automatically with the same checks as the webhook.
* It also repairs orders left in `APPLYING` by a crashed process, and prunes the delivery-id table after 90 days.

## Handling a held payment

1. Open the staff email or the Gateway Log entry, and note the UTR and amount.
2. Find that credit on the **bank statement** of the receiving account. Do not rely on YouPI alone.
3. If the money is there and the amount is right: open the invoice, choose **Add Payment**, set gateway **YouPI UPI**, transaction id = the UTR, and the amount. A later webhook for the same UTR is then logged as a duplicate.
4. If not, or if it was an overpayment or a payment against a cancelled invoice, refund it from the bank and reply to the client.
5. To let the client try UPI again after a rejected review, set that order's `status` in `mod_youpi_orders` to `CANCELLED`.

---

## Risks and limits

From YouPI's own README:

> "YOUPI PG V2 is an independent, experimental research and learning project. It is not represented as a certified, bank-approved, NPCI-approved, audited, or production-ready payment gateway."

> "Not for critical payments: do not rely on it for essential, high-value, high-volume, time-sensitive, or business-critical transactions. Do not use it as the sole source of truth for payment confirmation."

> "No official affiliation: this repository is not affiliated with, endorsed by, or sponsored by NPCI, RBI, any bank, or any UPI app."

> "Conservative project testing limit: for experiments, keep usage to no more than 20 payment attempts/transactions per day per receiving account unless you have verified the applicable bank, UPI app, and current NPCI rules and obtained any required approvals."

> "Bank alert parsing can be wrong or delayed. SMS, notification, and email formats can change, alerts may be duplicated or missing, and messages can be spoofed or misinterpreted."

> "Amount matching is not a complete payment identity check. Equal amounts, delayed notifications, and replayed events can cause a payment to be attributed to the wrong order."

> "A webhook signature does not prove funds settled. It only authenticates a message relative to a secret and implementation."

> "No compliance guarantee: using this software does not itself authorise you to operate a payment aggregator, payment system, or other regulated service."

What this means for GlobalHostia:

* **Reconcile against the bank statement every day.** Match each WHMCS transaction with gateway YouPI (transaction id = UTR) against a real credit on the receiving account. YouPI's `RECONCILED` status after a statement import does this for you inside YouPI.
* **Keep the manual-review threshold on.** INR 5,000 is a sensible start. It caps the loss from a wrong or spoofed alert, and big invoices get a human check.
* **Keep a regulated gateway as the fallback** (for example Razorpay, Cashfree or PayU) and leave it enabled for INR invoices. If YouPI, the observer phone or the bank account is down or restricted, clients can still pay.
* **Stay within volume.** Around 20 UPI payments a day per receiving account, per YouPI's guidance. Banks may restrict personal or current accounts that receive many small payments. Talk to your bank about the account type.
* **Legal and tax.** Collecting payments into your own account for your own services is different from acting as a payment aggregator. Take advice for your setup (Desert Tech Cloud Services LLC billing Indian customers in INR), including GST and FEMA where they apply.
* **Refunds and disputes** are manual and outside YouPI. Customers can raise disputes with their UPI app or bank; keep the UTR and invoice trail.
* **Customer data.** YouPI stores customer phone numbers and verifies them by WhatsApp OTP. Mention UPI/YouPI processing in the privacy policy, and keep the YouPI server and backups locked down.

## Data the module stores in WHMCS

* `mod_youpi_orders`: invoice id, order id, amount (paise), YouPI payment id, checkout URL, status, UTR, review reason, timestamps.
* `mod_youpi_deliveries`: webhook delivery ids, order id, event, outcome, time (pruned after 90 days).
* `mod_youpi_state`: the reconciler's last-run time.

The tables are created through Capsule on first use. There is no uninstall step. Drop the three tables by hand if you remove the module.
