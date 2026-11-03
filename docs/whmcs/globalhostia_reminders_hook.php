<?php
/**
 * GlobalHostia abandoned-cart + renewal reminders: WHMCS side.
 *
 * Upload to: <whmcs>/includes/hooks/globalhostia_reminders_hook.php   (next to globalhostia_hosting_hook.php)
 *
 * What it does (nothing else; it never changes WHMCS data):
 *  1. Cart pages (cart.php): prints window.GH_CART = {"token":"…","n":<items>,"client":true|false} in the footer.
 *     token = base64url(JSON) "." base64url(HMAC-SHA256("gh-cart.v1." + payload, secret)) with the cart CONTENTS ONLY:
 *     product ids, billing cycles, chosen domain names, domain registrations/transfers and years, currency id, the
 *     client id (0 for guests) and a hash of the session id. No prices, no customer data, no card data, no passwords.
 *     public/hp/whmcs.js posts it to https://globalhostia.com/api/reminders/cart, which re-checks the signature.
 *  2. AfterShoppingCartCheckout: tells globalhostia.com the order was placed (cart reminders stop at once).
 *  3. InvoicePaid: tells globalhostia.com the invoice is paid (overdue / renewal reminders stop at once).
 *  4. AfterCronJob: a "tick" so reminders run every WHMCS cron (globalhostia.com runs at most every 10 minutes).
 *  Webhooks are signed: header X-GH-Signature: t=<unix>,v1=hex(HMAC-SHA256("gh-hook.v1.<t>.<body>", secret)).
 *  They time out after 3 seconds and never block or break checkout.
 *
 * Secret: leave GH_REMINDERS_SECRET as it is to reuse GH_HOSTING_SECRET from globalhostia_hosting_hook.php (the value
 * from globalhostia.com/admin/hosting, "WHMCS hook secret"), or paste the value of the Vercel env REMINDERS_HMAC_SECRET.
 * Keep this file private.
 */
if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

use WHMCS\Database\Capsule;

const GH_REMINDERS_SECRET = 'USE_GH_HOSTING_SECRET';
const GH_REMINDERS_WEBHOOK = 'https://globalhostia.com/api/reminders/webhook';
const GH_REMINDERS_TTL = 7200; // cart token lifetime in seconds (the API accepts at most 3 hours)

function gh_rem_secret()
{
    if (strlen(GH_REMINDERS_SECRET) >= 32 && strpos(GH_REMINDERS_SECRET, 'USE_') !== 0 && strpos(GH_REMINDERS_SECRET, 'PASTE_') !== 0) {
        return GH_REMINDERS_SECRET;
    }
    if (defined('GH_HOSTING_SECRET') && strlen(GH_HOSTING_SECRET) >= 32 && strpos(GH_HOSTING_SECRET, 'PASTE_') !== 0) {
        return GH_HOSTING_SECRET;
    }
    return '';
}

function gh_rem_b64url($bin)
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function gh_rem_client_id()
{
    if (class_exists('\WHMCS\Authentication\CurrentUser')) {
        try {
            $cu = new \WHMCS\Authentication\CurrentUser();
            $client = $cu->client();
            if ($client) {
                return (int) $client->id;
            }
        } catch (\Throwable $e) {
        }
    }
    return !empty($_SESSION['uid']) ? (int) $_SESSION['uid'] : 0;
}

function gh_rem_session_key()
{
    $sid = session_id();
    return $sid ? substr(hash('sha256', 'gh-cart:' . $sid), 0, 32) : '';
}

/** Signed POST to globalhostia.com; fire-and-forget (3 s timeout), errors are ignored. */
function gh_rem_post(array $data)
{
    $secret = gh_rem_secret();
    if ($secret === '' || !function_exists('curl_init')) {
        return;
    }
    $body = json_encode($data, JSON_UNESCAPED_SLASHES);
    $t = time();
    $sig = 't=' . $t . ',v1=' . hash_hmac('sha256', 'gh-hook.v1.' . $t . '.' . $body, $secret);
    try {
        $ch = curl_init(GH_REMINDERS_WEBHOOK);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-GH-Signature: ' . $sig],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 3,
        ]);
        curl_exec($ch);
        curl_close($ch);
    } catch (\Throwable $e) {
    }
}

/* 1. cart snapshot token on cart pages */
add_hook('ClientAreaFooterOutput', 1, function ($vars) {
    if (($vars['filename'] ?? '') !== 'cart') {
        return '';
    }
    $secret = gh_rem_secret();
    $sk = gh_rem_session_key();
    if ($secret === '' || $sk === '') {
        return '';
    }
    $cart = isset($_SESSION['cart']) && is_array($_SESSION['cart']) ? $_SESSION['cart'] : [];
    $products = [];
    foreach (array_slice(isset($cart['products']) && is_array($cart['products']) ? $cart['products'] : [], 0, 20) as $p) {
        $pid = (int) ($p['pid'] ?? 0);
        if ($pid <= 0) {
            continue;
        }
        $cycle = strtolower(preg_replace('/[^a-z]/i', '', (string) ($p['billingcycle'] ?? '')));
        $products[] = [
            'pid' => $pid,
            'cycle' => $cycle !== '' ? $cycle : 'monthly',
            'domain' => strtolower(trim((string) ($p['domain'] ?? ''))),
            'options' => !empty($p['configoptions']) || !empty($p['addons']),
        ];
    }
    $domains = [];
    foreach (array_slice(isset($cart['domains']) && is_array($cart['domains']) ? $cart['domains'] : [], 0, 20) as $d) {
        $name = strtolower(trim((string) ($d['domain'] ?? '')));
        $type = ($d['type'] ?? '') === 'transfer' ? 'transfer' : (($d['type'] ?? '') === 'register' ? 'register' : '');
        if ($name === '' || $type === '') {
            continue;
        }
        $domains[] = ['domain' => $name, 'type' => $type, 'years' => max(1, min(10, (int) ($d['regperiod'] ?? 1)))];
    }
    $cid = gh_rem_client_id();
    $cur = (int) ($_SESSION['currency'] ?? 0);
    if ($cid > 0) {
        try {
            $cur = (int) Capsule::table('tblclients')->where('id', $cid)->value('currency');
        } catch (\Throwable $e) {
        }
    }
    $now = time();
    $payload = gh_rem_b64url(json_encode(['v' => 1, 'cid' => $cid, 'sk' => $sk, 'cur' => $cur, 'p' => $products, 'd' => $domains, 'iat' => $now, 'exp' => $now + GH_REMINDERS_TTL], JSON_UNESCAPED_SLASHES));
    $sig = gh_rem_b64url(hash_hmac('sha256', 'gh-cart.v1.' . $payload, $secret, true));
    $data = ['token' => $payload . '.' . $sig, 'n' => count($products) + count($domains), 'client' => $cid > 0];
    return '<script>window.GH_CART=' . json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES) . ';</script>';
});

/* 2. order placed */
add_hook('AfterShoppingCartCheckout', 1, function ($vars) {
    $orderId = (int) ($vars['OrderID'] ?? 0);
    $cid = 0;
    $email = '';
    try {
        $cid = (int) Capsule::table('tblorders')->where('id', $orderId)->value('userid');
        if ($cid > 0) {
            $email = (string) Capsule::table('tblclients')->where('id', $cid)->value('email');
        }
    } catch (\Throwable $e) {
    }
    gh_rem_post(['event' => 'order', 'orderid' => $orderId, 'invoiceid' => (int) ($vars['InvoiceID'] ?? 0), 'cid' => $cid, 'email' => $email, 'sk' => gh_rem_session_key()]);
});

/* 3. invoice paid */
add_hook('InvoicePaid', 1, function ($vars) {
    gh_rem_post(['event' => 'invoice_paid', 'invoiceid' => (int) ($vars['invoiceid'] ?? 0)]);
});

/* 4. WHMCS cron ran */
add_hook('AfterCronJob', 1, function ($vars) {
    gh_rem_post(['event' => 'tick']);
});
