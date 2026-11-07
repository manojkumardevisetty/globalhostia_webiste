# WHMCS admin login → GlobalHostia dashboard

The new dashboard has its own secure session. Redirecting `clientarea.php` to `/account` alone cannot sign in the client and can accidentally show an account already open in the browser.

## Install the WHMCS side

1. Upload **globalhostia_portal_hook.php** as a new file to the WHMCS installation's **includes/hooks/** folder. Keep the existing hosting hook intact.
2. It uses `GH_HOSTING_SECRET` from the already-installed `globalhostia_hosting_hook.php`, which must match the website's existing hosting-hook secret in GlobalHostia Admin → Hosting. If that hook is not configured, configure the shared secret directly on the server/admin page; never paste it into chat or a public file. Alternatively the WHMCS server can supply `HOSTING_HMAC_SECRET` as an environment variable.
3. If updating an earlier version, replace only `globalhostia_portal_hook.php`. Normal handoffs now keep the intermediate form hidden and continue automatically; a branded recovery button appears only if navigation is delayed or JavaScript is unavailable.
4. In WHMCS admin, open a client and select **Login as Owner** (Login as Client). The WHMCS homepage now starts a browser-bound handoff and opens **https://globalhostia.com/account** as that client.
5. Verify with a second client in the same browser: the dashboard must switch to the second client. The website audit log records `client_admin_handoff` with the WHMCS admin id and client id.

The website routes are deployed through main/Vercel. The PHP hook requires this separate upload to the WHMCS server; committing it to GitHub does not install it there.

## Scope and failure behavior

- Only WHMCS's authenticated masquerading admin state is eligible, using CurrentUser::isMasqueradingAdmin(). Normal customers, checkout and payment flows stay unchanged.
- The hook obtains the client from WHMCS's current authenticated context, never from a URL's client id.
- The website generates a random challenge held in a Secure, HttpOnly, host-only cookie. WHMCS posts a purpose-specific HMAC assertion bound to that challenge, valid for 60 seconds. It contains no passwords or API credentials and is not put in a URL.
- A unique, namespaced record in the existing oauth_assertions table rejects repeated assertions atomically across website instances. No schema migration is required. Existing OAuth housekeeping also removes expired records.
- Only active client accounts returned by the WHMCS API are accepted. Admin-created sessions last 15 minutes. Normal customer sessions keep their existing lifetime.
- Failure shows an explicit account-switch error and creates no session. It never silently opens an older portal session for a different client.
- The Advanced settings entry has been removed from the dashboard's shared desktop/mobile account menu. Other necessary billing/service integrations remain available.

## Verification

TypeScript, project tests, PHP syntax parsing, and handler integration checks cover signatures, expiry, browser binding, forged ids, cross-origin requests, concurrent replay, session identity/lifetime and API/database outages. The final real WHMCS admin masquerade test requires the hook upload and an admin session; it cannot be confirmed by public-site tests.

To undo the WHMCS handoff, remove only `globalhostia_portal_hook.php`. This does not remove the hosting integration or affect billing.
