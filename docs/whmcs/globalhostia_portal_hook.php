<?php
/**
 * WHMCS admin "Login as Owner" -> https://globalhostia.com/account.
 * Upload this NEW file into <whmcs>/includes/hooks/. Leave the existing hosting hook and its secret unchanged.
 * Uses GH_HOSTING_SECRET from globalhostia_hosting_hook.php (loaded earlier alphabetically), or the server's
 * HOSTING_HMAC_SECRET environment variable. It must match the website's existing hosting-hook secret.
 * No password, API key or shared secret is sent to the browser. The signed assertion expires in 60 seconds,
 * is bound to the portal's HttpOnly browser challenge, and is accepted only once by the portal.
 */
if (!defined('WHMCS')) { die('This file cannot be accessed directly'); }

function gh_portal_encode($value) {
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

add_hook('ClientAreaPageHome', 1, function ($vars) {
    try {
        $current = new \WHMCS\Authentication\CurrentUser();
        // Crucially, a client id in the URL, an admin session alone, or a normal customer login is insufficient.
        if (!$current->isMasqueradingAdmin()) { return []; }
        $client = $current->client();
        $admin = $current->admin();
        if (!$client || !$admin || (int) $client->id <= 0 || (int) $admin->id <= 0) { return []; }
        $secret = defined('GH_HOSTING_SECRET') ? GH_HOSTING_SECRET : getenv('HOSTING_HMAC_SECRET');
        if (!is_string($secret) || strlen($secret) < 32 || strpos($secret, 'PASTE_') === 0) { return []; }
        $state = isset($_GET['gh_portal_state']) && is_string($_GET['gh_portal_state']) ? $_GET['gh_portal_state'] : '';
        header('Cache-Control: private, no-store');
        header('Referrer-Policy: no-referrer');
        header('X-Robots-Tag: noindex, nofollow');
        if ($state === '') {
            header('Location: https://globalhostia.com/account/whmcs/start', true, 303);
            exit;
        }
        if (!preg_match('/^[A-Za-z0-9_-]{43}$/D', $state)) { return []; }
        $aud = 'globalhostia:whmcs-admin-portal:v1';
        $now = time();
        $body = gh_portal_encode(json_encode([
            'aud' => $aud, 'cid' => (int) $client->id, 'admin' => (int) $admin->id,
            'state' => $state, 'jti' => gh_portal_encode(random_bytes(32)), 'iat' => $now, 'exp' => $now + 60,
        ], JSON_UNESCAPED_SLASHES));
        $assertion = $body . '.' . gh_portal_encode(hash_hmac('sha256', $aud . ':' . $body, $secret, true));
        $nonce = gh_portal_encode(random_bytes(24));
        header('Content-Type: text/html; charset=utf-8');
        header("Content-Security-Policy: default-src 'none'; script-src 'nonce-" . $nonce . "'; form-action https://globalhostia.com; base-uri 'none'; frame-ancestors 'none'");
        // POST rather than a query string: assertions stay out of URLs, referrers and normal access logs.
        echo '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening your GlobalHostia account</title><body><p>Opening your GlobalHostia account…</p><form method="post" action="https://globalhostia.com/account/whmcs/callback"><input type="hidden" name="assertion" value="' . htmlspecialchars($assertion, ENT_QUOTES, 'UTF-8') . '"><button type="submit">Continue to your account</button></form><script nonce="' . $nonce . '">document.forms[0].submit();</script></body></html>';
        exit;
    } catch (\Throwable $e) {
        // Fail closed: retain WHMCS's already-authenticated page if configuration or runtime support is missing.
        return [];
    }
});
