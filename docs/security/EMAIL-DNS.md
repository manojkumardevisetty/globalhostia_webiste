# Email DNS for globalhostia.com: SPF, DKIM, DMARC

Nothing here has been changed in DNS. These are the records to publish, in order, by the owner.

## What we could and could not check

- DNS for globalhostia.com is hosted on **Cloudflare** (nameservers `vera.ns.cloudflare.com`, `cartman.ns.cloudflare.com`,
  read from the Vercel domain config on 2026-11-04). The apex A record points at Vercel (`76.76.21.21`).
- The build sandbox cannot resolve public DNS (DNS-over-HTTPS and port 53 are blocked), so the **current TXT/MX records
  were not read**. Run the checks in step 0 first and adjust the records below to what you find.
- Mail that is sent *as* @globalhostia.com, from what the code shows:
  | Sender | Where it sends from | Notes |
  |---|---|---|
  | WHMCS (invoices, tickets, owner alerts, reminders via `SendEmail`) | WHMCS server `my.globalhostia.com`, **216.158.237.114** (DirectAdmin) | SMTP or PHP mail on that server |
  | Reminder SMTP transport (optional, `SMTP_HOST`…) | the owner's mailbox on the hosting server (same DirectAdmin box) | `lib/reminders/smtp.ts` |
  | Mailboxes (support@, billing@ …) | DirectAdmin mail on 216.158.237.114, **or Google Workspace if you moved them there** | check the MX record |
  | The website itself (Vercel) | sends nothing directly | all mail goes through WHMCS or SMTP above |

## Step 0: read what is there now (2 minutes)

From any computer:

```sh
dig +short TXT globalhostia.com            # existing SPF (there must be only ONE "v=spf1" record)
dig +short MX  globalhostia.com            # mail.globalhostia.com → DirectAdmin; *.google.com / smtp.google.com → Google Workspace
dig +short TXT _dmarc.globalhostia.com     # existing DMARC
dig +short TXT x._domainkey.globalhostia.com       # DirectAdmin DKIM (selector "x")
dig +short TXT google._domainkey.globalhostia.com  # Google Workspace DKIM (selector "google")
```

Or open Cloudflare → globalhostia.com → DNS → Records and filter by TXT and MX. The site's own checker
(Account → Domain health, `lib/health/core.ts`) also validates SPF and DMARC syntax.

## Step 1: SPF (one TXT record on `@`)

Use exactly one of these, matching your MX result. Replace an existing `v=spf1` record; never add a second one.

**A. Mail on the DirectAdmin/WHMCS server only (MX = mail.globalhostia.com):**

```
Type: TXT   Name: @   TTL: Auto   Proxy: n/a
v=spf1 ip4:216.158.237.114 ~all
```

**B. Mailboxes on Google Workspace, WHMCS still sending from its server:**

```
v=spf1 ip4:216.158.237.114 include:_spf.google.com ~all
```

Notes
- Do **not** use the bare `a` mechanism: the apex A record is Vercel, which never sends your mail.
- If the DirectAdmin server has an IPv6 address that sends mail, add `ip6:<address>` (check `ip -6 addr` on the server or
  the `Received:` header of a WHMCS email).
- If you use any other sender (newsletter tool, helpdesk), add its documented `include:` before `~all`. Stay under 10 DNS lookups.
- Keep `~all` (soft fail) during the DMARC rollout. Switch to `-all` only after DMARC is at `p=reject` with clean reports.

## Step 2: DKIM

**DirectAdmin (WHMCS and server mailboxes).** DirectAdmin signs with selector `x`.
1. DirectAdmin → (user level) E-Mail Manager → DKIM, or as admin: `cd /usr/local/directadmin/scripts && ./dkim_create.sh globalhostia.com`.
2. DirectAdmin shows the public key: copy it into Cloudflare exactly:
   ```
   Type: TXT   Name: x._domainkey   Content: v=DKIM1; k=rsa; p=MIIBIjANBgkq...   (the full key, one line)
   ```
   Because DNS is on Cloudflare (not DirectAdmin), DirectAdmin cannot publish it itself: this copy step is required.
3. Make sure WHMCS sends through the local mail server (WHMCS → System Settings → General → Mail: SMTP `localhost` or
   PHP mail on the same server) so its messages get signed.

**Google Workspace (only if MX points to Google).** Admin console → Apps → Google Workspace → Gmail → Authenticate email →
Generate new record (2048-bit, selector `google`) → add the TXT record `google._domainkey` in Cloudflare → Start authentication.

Check: send a WHMCS test email to a Gmail address → Show original → `DKIM: 'PASS' with domain globalhostia.com`.

## Step 3: DMARC rollout (2 to 4 weeks)

Create a mailbox (or alias) `dmarc@globalhostia.com` for aggregate reports, or use a free report reader
(e.g. Cloudflare DMARC Management in the Cloudflare dashboard, which also gives you a `rua` address).

| When | Record (`TXT` on `_dmarc`) | What to do |
|---|---|---|
| Day 0 | `v=DMARC1; p=none; rua=mailto:dmarc@globalhostia.com; fo=1; adkim=r; aspf=r` | Collect reports. Find every legitimate sender that fails SPF/DKIM and fix it (steps 1–2). |
| Week 2 (reports clean) | `v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@globalhostia.com; fo=1; adkim=r; aspf=r` | A quarter of failing mail goes to spam. Watch reports and customer complaints for 3–4 days. |
| Week 2 + 4 days | `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@globalhostia.com; fo=1` | All failing mail to spam. |
| Week 3–4 | `v=DMARC1; p=reject; rua=mailto:dmarc@globalhostia.com; fo=1` | Forged @globalhostia.com mail is refused. Then consider SPF `-all`. |

Each step: only move on when reports show WHMCS (216.158.237.114) and your mailboxes passing **both** SPF and DKIM aligned
with globalhostia.com. If something legitimate breaks, go back one step (DNS change, effective within the TTL).

Subdomains: without `sp=` they inherit the policy. If `my.globalhostia.com` or other subdomains send mail, they need their own
SPF/DKIM before `p=reject`.

## Optional, later

- **TLS-RPT** (reports about TLS failures delivering to you): `TXT _smtp._tls  v=TLSRPTv1; rua=mailto:dmarc@globalhostia.com`
- **MTA-STS** needs an HTTPS policy file at `mta-sts.globalhostia.com`; only worth it once mail is on Google or the server has a valid certificate for its MX name.
- **BIMI** (logo in Gmail) requires `p=quarantine` or `p=reject` first.
