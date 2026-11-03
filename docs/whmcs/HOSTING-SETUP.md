# Manage hosting panel: setup

Customers manage their hosting (DNS, email, files, databases, SSL, backups) from the service page in the
client area (`my.globalhostia.com/clientarea.php?action=productdetails&id=N`) without logging in to the control panel.
The "Login to DirectAdmin" button stays on the page as a fallback.

```
browser (my.globalhostia.com)                 globalhostia.com (Vercel)                       panel server
  WHMCS hook prints window.GH_HOSTING  ──►  /api/hosting/*  ── token HMAC + expiry check
  {token, sid, panel} (10 min)               ── WHMCS GetClientsProducts: owner? Active?
  whmcs.js renders the panel                  ── pick server by WHMCS server ID / host / IP
  Authorization: Bearer <token>               ── acts as that account only  ─────────────►  DirectAdmin / cPanel / Plesk
                                              ── audit log (Admin → Activity Log)
```

Panel keys and the shared secret are stored only on globalhostia.com (AES-256-GCM encrypted in the database,
key = `HOSTING_ENC_KEY` or `AUTH_SECRET`). They are never sent to a browser.

## 1. Add your servers (globalhostia.com/admin/hosting)

Open **Admin → Business → Hosting panels** (ADMIN or OWNER role). Add one entry per panel server. Each entry has its own key.

| Field | What to enter |
|---|---|
| Name | Anything, e.g. `Sonic USA` |
| Panel | DirectAdmin, cPanel / WHM or Plesk |
| Panel URL | `https://<panel host name>:<port>`. The host name must have a valid TLS certificate (the API does not accept self-signed certificates, so do not use the bare IP unless it has a trusted certificate). |
| API user | DirectAdmin: the admin or reseller that owns the accounts. cPanel: the WHM user that owns the token. Plesk: `admin`. |
| Key | DirectAdmin Login Key / WHM API token / Plesk API key (see below). Stored encrypted; leave empty when editing to keep it. |
| WHMCS server IDs | WHMCS → System Settings → Servers → edit a server: the `id=` in the address bar. |
| Also match host names / IPs | Fallback matching against the service's server host name or IP from WHMCS. |

Then press **Test connection** on each server.

Current WHMCS servers (DirectAdmin module):

| WHMCS server | IP | Add here? |
|---|---|---|
| Gloablhosita Sonic USA (default, DirectAdmin 1.713) | 216.158.237.114 | yes |
| Globalhostia USA | 198.251.89.82 | yes (0 services today) |
| globalhostia Singapore Hbr | 15.235.227.117 | yes |
| resell.Server.broker.vps (module SBVPS) | | **no**: VPS reseller provisioning, not a hosting panel. Services on unmatched servers simply get no panel. |

Optional single-server fallback via Vercel env (used only when the list above is empty): `DA_URL`, `DA_USER`,
`DA_LOGIN_KEY`, `DA_WHMCS_SERVER_IDS` (comma list).

## 2. Create the panel keys

### DirectAdmin (Login Key)

Log in to DirectAdmin **as the admin or reseller that owns the hosting accounts** (the same user you enter as API user),
then **Login Keys → Create Key** (Evolution: *Account → Login Keys*):

- Key name: `globalhostia-hosting`
- Expiry: never, or a date you will remember to rotate
- Uses: unlimited
- Allow HTML / Clear key: off
- **Commands: tick only these**

```
CMD_API_SHOW_USERS
CMD_API_SHOW_DOMAINS
CMD_API_DNS_CONTROL
CMD_API_POP
CMD_API_EMAIL_FORWARDERS
CMD_API_FILE_MANAGER
CMD_FILE_MANAGER
CMD_API_DATABASES
CMD_API_DB_USER
CMD_API_SSL
CMD_API_SITE_BACKUP
CMD_API_SHOW_USER_USAGE
CMD_API_SHOW_USER_CONFIG
CMD_API_SUBDOMAINS
CMD_API_DOMAIN_POINTER
CMD_API_REDIRECT
CMD_API_ADDITIONAL_DOMAINS
CMD_API_DOMAIN
CMD_API_EMAIL_AUTORESPONDER
CMD_API_EMAIL_VACATION
CMD_API_SPAMASSASSIN
CMD_API_FTP
CMD_API_CRON_JOBS
```

The last twelve were added with the second feature set (Overview, subdomains, aliases, redirects, PHP version,
autoresponders, vacation, spam filter, FTP, cron, protected folders). If you created the key before, edit it and tick them.
Notes:
- `CMD_API_SHOW_USER_USAGE` / `CMD_API_SHOW_USER_CONFIG` (Overview) are sent as the key owner with `user=<account>`, not via login-as.
- `CMD_API_DOMAIN` also covers creating/deleting domains in DirectAdmin; our API only ever sends `action=php_selector`
  for a domain the account owns. `CMD_API_ADDITIONAL_DOMAINS` is only used with `action=view` to read PHP versions.
- Protected folders are set with `CMD_API_FILE_MANAGER` (`action=protect`, already allowed). The list of protected
  folders and the WordPress list come from DirectAdmin's JSON API (`GET /api/web-protect/list`,
  `GET /api/wordpress/locations`). If your key's command restrictions block `/api/*`, the panel still lets customers
  protect folders but cannot list existing ones, and the WordPress tab is hidden.

Never tick `ALL_USER`, `ALL_RESELLER`, `ALL_ADMIN`, `CMD_LOGIN_KEYS` or `CMD_API_LOGIN_KEYS` (those can read or change keys).
`CMD_API_SHOW_USERS` is only used by the admin **Test connection** button.
- Allowed IPs: Vercel uses changing IPs, so leave empty unless you route through a fixed egress.

The API acts as the customer with DirectAdmin's documented login-as: Basic auth `admin|customer:<key>`
(a reseller key can only act as that reseller's own users). If Test connection works but customer calls fail with
"refused the API login", check that the key's command list contains the command named in the error and that the
account belongs to the key's user.

### cPanel / WHM (API token)

WHM → **Development → Manage API Tokens → Generate Token** as root (or the reseller that owns the accounts).
Give it the ACLs to list accounts and to call the cPanel API as the account users (on a reseller: *List Accounts* and
*cPanel API as user*/"Use the cPanel API on behalf of my accounts"). Panel URL: `https://<host>:2087`.

### Plesk (API key)

On the server: `plesk bin secret_key --create -description "globalhostia-hosting"` (add `-ip-address <ip>` only if you have a fixed egress IP).
Paste the printed key. Panel URL: `https://<host>:8443`, API user: `admin`.

## 3. Shared secret for the WHMCS hook

In **Admin → Hosting panels → WHMCS hook secret** press **Generate secret**, then **Reveal** and copy it.
(Alternatively set `HOSTING_HMAC_SECRET` in Vercel; the env value wins and the admin buttons are disabled.)

Rotating the secret breaks the panel until the hook file has the new value: update both together.

## 4. Upload the WHMCS hook

1. Open `docs/whmcs/globalhostia_hosting_hook.php`, replace `PASTE_THE_SECRET_FROM_GLOBALHOSTIA_ADMIN_HOSTING_HERE` with the secret.
2. Upload it to the WHMCS server as `/includes/hooks/globalhostia_hosting_hook.php` (same folder as the existing hook that loads `whmcs.js`).
3. Keep the file private (it can mint tokens for any client). Permissions 640, owned by the web user.
4. Bump the `?v=YYYYMMDD` on the existing hook's `https://globalhostia.com/hp/whmcs.js?v=…` and `whmcs.css?v=…` URLs.
   Versioned URLs are cached for a year, so without a new `v` browsers keep the old files.

The hook only prints a token on the service details page, for the logged-in client's own **Active** service whose
server module is `directadmin`, `cpanel` or `plesk`.

If WHMCS sends a Content-Security-Policy, `connect-src` must include `https://globalhostia.com`.

## 5. Test

1. Admin → Hosting panels → **Test connection** shows "DirectAdmin answered in …ms (N users visible …)".
2. Log in to the client area as a customer with an Active DirectAdmin service (or use *Login as Client* from WHMCS admin).
3. Open the service: a **Manage hosting** card with tabs (DNS · Email · Files · Databases · SSL · Backups) appears under the service details.
4. Try a harmless change: add a TXT record `_gh-test` = `hello`, then delete it.
5. Admin → **Activity Log**: entries `hosting.dns.add` / `hosting.dns.delete` by `client#<id>`.
6. In the browser dev tools, `window.GH_HOSTING.token` is the only credential on the page; after 10 minutes the panel asks to reload.

Troubleshooting

| Message in the panel | Meaning |
|---|---|
| Hosting management is not configured yet | No shared secret on globalhostia.com |
| Not signed in | Token signature wrong: secret in the hook differs from the admin one |
| Your session expired | Token older than 10 minutes; reload |
| This service is not on a server that can be managed here | No server entry matches the service's WHMCS server ID / host / IP |
| The hosting panel refused the API login | Wrong key, key expired, or command not in the key's list |
| TLS certificate is not trusted | Use the panel's host name with a valid certificate in the Panel URL |

## Limits and safety

- Every request re-checks the token (HMAC-SHA256, max 15 min lifetime) and, at most once a minute per token,
  WHMCS ownership + Active status. Domains must be in the account's own domain list; file paths are normalised,
  `..` is refused, everything is relative to the account's home; database names must carry the account prefix.
- CORS allows only `https://my.globalhostia.com` (override with `HOSTING_ALLOWED_ORIGINS`), no cookies.
- Rate limits per client: 120 reads and 30 changes per minute, plus 300 requests per minute per IP.
- Uploads and downloads up to 4 MB (Vercel request/response limit); the editor opens text files up to 1 MB.
- Deleting `domains`, `public_html`, `imap`, `Maildir`, `mail`, `etc`, `backups`, `.ssh` from the home folder is blocked.
- Every change (and failed attempt) is in the activity log with client, service, server and target, never passwords or file contents.

## What each panel supports

| | DirectAdmin | cPanel | Plesk |
|---|---|---|---|
| DNS list/add/edit/delete | yes | yes (UAPI DNS::parse_zone / mass_edit_zone) | yes (REST /dns/records) |
| Email mailboxes, password, quota, forwarders | yes | yes (UAPI Email) | not offered |
| Files browse/edit/rename/delete/new folder | yes | yes (UAPI Fileman + API 2 fileop/mkdir) | not offered |
| File upload/download | yes | not offered | not offered |
| Databases + users + password | yes | yes (UAPI Mysql) | yes (REST /databases, /dbusers) |
| SSL status | live HTTPS check (all panels) | | |
| Issue SSL | Let's Encrypt (CMD_API_SSL) | AutoSSL run | Let's Encrypt extension via CLI gateway |
| Backups list/create | yes | yes (fullbackup_to_homedir) | not offered |
| Backup restore | yes | not offered | not offered |
| Overview (disk, bandwidth, inodes, counts vs limits) | yes | yes (ResourceUsage) | not offered |
| Subdomains | yes | yes | not offered |
| Domain aliases / pointers | yes | not offered | not offered |
| Redirects | yes | yes (Mime) | not offered |
| PHP version per domain | yes (PHP selector slots) | yes (MultiPHP, LangPHP) | not offered |
| Autoresponders | yes | yes (no CC copy) | not offered |
| Vacation messages | yes | not offered | not offered |
| Spam filter (SpamAssassin) | yes | not offered | not offered |
| FTP accounts | yes | yes | not offered |
| Cron jobs | yes | yes (API 2 Cron) | not offered |
| Protected folders | yes | not offered | not offered |
| WordPress sites (list) | when DirectAdmin's WordPress manager answers | not offered | not offered |

WordPress one-click install is not offered yet: Softaculous / Installatron have no documented per-user API we could
verify, and DirectAdmin's own `/api/wordpress/install-quick` request body is not documented publicly. Customers install
from the control panel; the site then appears in the WordPress tab.

The panel hides tabs and buttons a server type does not support. The provider interface (`lib/hosting/types.ts`)
has room for a future VPS adapter (power, reboot, reinstall, console) for modules such as SBVPS.

## Arabic (العربية) and right-to-left

`public/hp/whmcs.js` follows WHMCS's language. When the client area is Arabic it loads `/hp/whmcs-i18n.js` (the Arabic
dictionary), sets `<html lang="ar" dir="rtl">`, loads IBM Plex Sans Arabic from Google Fonts and shows the Manage hosting
panel and the skin's own strings in Arabic (numbers and dates in `ar-AE` with Latin digits). An "English / العربية"
entry is added to the account menu and the footer; it uses WHMCS's own `?language=arabic|english`.

Owner steps:
1. WHMCS Admin → Setup → General Settings → Localisation: tick **Allow clients to choose language** (and make sure the
   `arabic` language is available; WHMCS ships `lang/arabic.php`).
2. Re-upload `docs/whmcs/globalhostia_hosting_hook.php` (it now also prints `window.GH_LANG` on every client-area page,
   so the skin knows the language even without `?language=` in the URL).
3. Server-generated text (site-health check details, registrar step-by-step guides, some error messages) is still
   English; check titles, fix buttons and toasts are translated in the browser.

Command palette: on the service page, Ctrl+K (⌘K on a Mac) or the search button in the panel header searches sections,
domains, mailboxes, databases, FTP accounts, subdomains and DNS records of the selected domain, plus actions.
