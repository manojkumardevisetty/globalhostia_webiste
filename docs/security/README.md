# Security essentials: what is on, how to switch it, owner steps

Code: `lib/security/*`. Admin: **Admin > Security** (OWNER/ADMIN), **My account** (each admin), **Users & Roles** (OWNER).
Every control can be switched off from the admin *and* from the server environment, so nobody can be locked out.

## On by default

| Control | Default | Switch in admin | Emergency env (Vercel → Settings → Environment Variables, then redeploy) |
|---|---|---|---|
| Admin two-factor (TOTP) | available to every admin; **asked for only once an admin enrols**; not required | My account (enrol / off), Users & Roles (Require / Reset), Security (*Require for every admin*) | `ADMIN_2FA_DISABLED=1` skips the code for everyone |
| Tracked admin sessions | on: new session id at every sign-in (old cookie revoked), list + sign out in My account / Security | Security > *Sign out after inactivity* (default 120 min, 0 = off) | (fails open if the database is unreachable) |
| New-browser sign-in alert | on: email to the owner via WHMCS `SendEmail` (support-alert client account) | Security > *Email the owner…* | |
| “Remember this browser” | offered, 30 days | Security > days (0 = always ask) | |
| Content-Security-Policy | **enforced** | Security > Mode (enforce / report only / off) + extra sources | `CSP_MODE=report` or `off` (least strict of env and admin wins) |
| Central rate limits | on | Security > *Rate-limit sensitive endpoints*, multiplier 0.25–10 | `RATE_LIMITS=off` |
| Cloudflare Turnstile on forms | **off until keys exist**; then on for lead, migration, broker, premium, quote, password reset (customer sign-in off) | Security > Turnstile + per form | `TURNSTILE_DISABLED=1`; or remove the keys |
| security.txt + /security page | on | Security > *Security contact*, *Policy URL* | |

Honeypot fields and time traps on the forms are unchanged and always on.

## Two-factor sign-in (admins)

- Standard TOTP (RFC 6238, 30 s, 6 digits, SHA-1) with any authenticator app; implemented with Node `crypto`
  (`lib/security/totp.ts`, tested against the RFC vectors). QR code generated on the server (`qrcode-generator`), the
  secret never goes to a third party. Secret sealed with AES-256-GCM (`MFA_ENC_KEY`, else `AUTH_SECRET`).
- 10 one-time recovery codes (`abcde-23456`), stored as HMAC-SHA256 hashes, shown once. Codes are replay-protected
  (a code's 30-second step can be used once).
- Flow: password → `/admin/login/2fa` (10-minute step token, never a session) → session. Admins required to have it but
  not enrolled set it up right there.
- Limits: 10 failed passwords per IP per 10 min and per account per 30 min; 6 wrong codes per account per 5 min.
- Passkeys (WebAuthn) were **not** added: `@simplewebauthn/server` plus a browser library and a credential store is more
  than "simple"; TOTP + recovery codes cover the need. Can be added later on top of `admin_mfa`.

### Owner: enrol (2 minutes)
1. Sign in → avatar menu → **My account** → *Two-factor sign-in* → **Set up two-factor**.
2. Scan the QR code with Google Authenticator / Microsoft Authenticator / 1Password / Authy, type the 6 digits.
3. Save the 10 recovery codes (password manager or print), click *I have saved them*.
4. Optional: Users & Roles → **Require** for each admin, or Security → *Require two-factor for every admin*.

### Locked out?
- Lost phone: use a recovery code at the code prompt. Another OWNER can **Reset** you in Users & Roles.
- No codes and no other owner: Vercel → Environment Variables → `ADMIN_2FA_DISABLED` = `1` → Redeploy → sign in with the
  password → My account → set two-factor up again → remove the variable → Redeploy.
- Rotated `AUTH_SECRET`/`MFA_ENC_KEY`: stored secrets become unreadable; same escape as above, then Reset + enrol.

## Rate limits (`lib/security/ratelimit-core.ts`)

| Rule | Per IP | Per account | Used by |
|---|---|---|---|
| admin-login (failures only) | 10 / 10 min | 10 / 30 min | `/admin/login` |
| admin-2fa (failures only) | 20 / 10 min | 6 / 5 min | `/admin/login/2fa` |
| account-login | 20 / 10 min | 10 / 15 min | `/account/login` (plus the existing DB failure counter) |
| password-reset | 6 / 15 min | 3 / hour | `/account/forgot` |
| form | 10 / 10 min | 5 / hour per email | `/api/lead`, `/api/free-migration`, `/api/broker-request`, `/api/premium-request`, `/api/store/quote` |
| ai | 40 / min | | `/api/ai/*` |
| oauth | 600 / min | | `/oauth/*` (AI platforms share egress IPs) |
| mcp | 600 / min | | `/mcp`, `/mcp/auth`, `/mcp/chatgpt`, `/api/mcp` |
| reminders | 240 / min | | `/api/reminders/*` (WHMCS calls from one IP) |
| domain-check | 30 / min | | `/api/domain-check` |
| csp-report | 60 / min | | `/api/csp-report` |

These sit in front of the per-endpoint limits that already existed (which are kept). Replies: HTTP 429, `Retry-After`,
JSON `{ok:false, error:"rate_limited", message}` with a human sentence (HTML forms show it inline). Counters are in memory
per serverless instance: they stop bursts; the Vercel Firewall rules below add a platform-wide layer.
Sign-up hands off to the WHMCS registration page on `my.globalhostia.com`, so protect it there: WHMCS → System Settings →
General Settings → Security → *Captcha Form Protection* → tick *Registration* (WHMCS supports reCAPTCHA / hCaptcha).

## Cloudflare Turnstile: free setup (5 minutes)

1. https://dash.cloudflare.com → **Turnstile** → *Add widget*. Name `globalhostia.com`; hostnames: `globalhostia.com`,
   `www.globalhostia.com`, `my.globalhostia.com` (the offer pop-up also runs in the client area),
   `globalhostiawebiste.vercel.app`. Widget mode **Managed**. Pre-clearance: no.
2. Copy the **Site key** and **Secret key**.
3. Vercel → globalhostiawebiste → Settings → Environment Variables (Production + Preview):
   `TURNSTILE_SITE_KEY=<site key>`, `TURNSTILE_SECRET_KEY=<secret key>` → Redeploy.
4. Admin > Security: Turnstile is on for the default forms; switch forms on/off there. Test the footer sign-up form.
The script loads only when someone starts typing in one of those forms. If Cloudflare is unreachable the server lets the
form through (logged as `turnstile_unreachable` in the Activity log). The AI chat keeps its own optional Turnstile setting
in Admin > AI assistant.

## Vercel Firewall: proposed rules (not applied)

Current state (read 2026-11-04 with the Vercel API): **no custom firewall configuration exists** for project
`prj_FdAPdQs5iwjGegrchVw1g81zCN94` (`GET /v1/security/firewall/config/active` → 404 "config not found"); only the
platform defaults (DDoS mitigation) apply. Suggested rules, in this order (Vercel → Project → Firewall → Configure):

| # | Name | If | Then |
|---|---|---|---|
| 1 | Block scanners | path matches `^/(wp-admin\|wp-login\.php\|xmlrpc\.php\|\.env\|\.git/\|phpmyadmin\|cgi-bin)` | **Deny** (the site has no WordPress or PHP) |
| 2 | Admin sign-in rate limit | path starts with `/admin/login` and method `POST` | **Rate limit** 20 requests / 60 s per IP → deny 10 min |
| 3 | Form flood | path in `/api/lead`, `/api/free-migration`, `/api/broker-request`, `/api/premium-request`, `/api/store/quote`, `/account/forgot` and method `POST` | **Rate limit** 30 / 60 s per IP → 429 |
| 4 | AI chat flood | path starts with `/api/ai/` | **Rate limit** 60 / 60 s per IP → 429 |
| 5 | Client sign-in | path `/account/login`, method `POST` | **Rate limit** 30 / 60 s per IP → challenge |
| 6 (optional) | Challenge non-browsers on admin | path starts with `/admin` and user agent matches `curl\|python-requests\|Go-http-client\|wget` | **Challenge** |

Do **not** rate-limit `/oauth/*`, `/mcp*` or `/api/reminders/*` tightly at the edge: Claude/ChatGPT and WHMCS call them
from shared server IPs. Keep *Attack Challenge Mode* off unless under attack (it also challenges AI agents and WHMCS hooks).
Bot protection (managed ruleset) is fine in *Log* mode first.

## Email DNS

See [EMAIL-DNS.md](EMAIL-DNS.md): SPF, DKIM, DMARC records and a 2–4 week rollout. Nothing was changed in DNS.

## security.txt

`/.well-known/security.txt` (and `/security.txt`): Contact (Admin > Security, else Settings email), Expires (always one
year ahead), Policy (`/security`), Canonical. `/security` is a short public page on reporting and how the site is protected.

## Dependencies

`npm audit --omit=dev` (2026-11-04): 2 advisories in the copy of PostCSS 8.4.31 bundled inside `next` (build-time CSS
processing). Fixed without a breaking upgrade by `"overrides": { "next": { "postcss": "$postcss" } }` (PostCSS 8.5.32, a
minor version). Result: **0 vulnerabilities**. `npm audit fix --force` would have moved to Next 16 (breaking): not done.
