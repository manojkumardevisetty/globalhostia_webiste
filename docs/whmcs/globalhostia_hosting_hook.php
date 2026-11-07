<?php
/**
 * GlobalHostia "Manage hosting" panel: identity hook for the WHMCS client area.
 *
 * Upload to: <whmcs>/includes/hooks/globalhostia_hosting_hook.php
 *
 * On the service details page (clientarea.php?action=productdetails&id=N) of a logged-in client, for a service that
 *   - belongs to that client,
 *   - is Active, and
 *   - is provisioned by the directadmin, cpanel or plesk server module,
 * it prints   <script>window.GH_HOSTING={"token":"...","sid":N,"panel":"directadmin"};</script>
 * The token is base64url(json{cid,sid,exp}) . "." . base64url(HMAC-SHA256(payload, GH_HOSTING_SECRET)) and is valid
 * for 10 minutes. public/hp/whmcs.js sends it to https://globalhostia.com/api/hosting/* which re-checks the HMAC,
 * the expiry and (through the WHMCS API) that the service still belongs to the client and is Active.
 *
 * GH_HOSTING_SECRET must be exactly the value shown in globalhostia.com/admin/hosting ("WHMCS hook secret")
 * or set there as the HOSTING_HMAC_SECRET environment variable. Keep this file private: anyone holding the secret
 * can mint tokens for any client.
 */
if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

use WHMCS\Database\Capsule;

const GH_HOSTING_SECRET = 'PASTE_THE_SECRET_FROM_GLOBALHOSTIA_ADMIN_HOSTING_HERE';
const GH_HOSTING_TTL = 600; // seconds; the API refuses tokens that live longer than 15 minutes
const GH_HOSTING_MODULES = ['directadmin', 'cpanel', 'plesk'];

function gh_hosting_b64url($bin)
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function gh_hosting_client_id()
{
    // WHMCS 8+: users and client accounts are separate; the "current client" is the account being viewed
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

add_hook('ClientAreaFooterOutput', 1, function ($vars) {
    if (($vars['templatefile'] ?? '') !== 'clientareaproductdetails') {
        return '';
    }
    if (strlen(GH_HOSTING_SECRET) < 32 || strpos(GH_HOSTING_SECRET, 'PASTE_') === 0) {
        return '';
    }
    $clientId = gh_hosting_client_id();
    $serviceId = (int) ($vars['id'] ?? ($vars['serviceid'] ?? ($_GET['id'] ?? 0)));
    if ($clientId <= 0 || $serviceId <= 0) {
        return '';
    }
    try {
        $row = Capsule::table('tblhosting as h')
            ->join('tblproducts as p', 'p.id', '=', 'h.packageid')
            ->leftJoin('tblservers as s', 's.id', '=', 'h.server')
            ->where('h.id', $serviceId)
            ->where('h.userid', $clientId)
            ->select('h.domainstatus', 'p.servertype', 's.type as stype')
            ->first();
    } catch (\Throwable $e) {
        return '';
    }
    if (!$row || $row->domainstatus !== 'Active') {
        return '';
    }
    $module = strtolower((string) ($row->stype ?: $row->servertype));
    if (!in_array($module, GH_HOSTING_MODULES, true)) {
        return '';
    }
    $payload = gh_hosting_b64url(json_encode(['cid' => $clientId, 'sid' => $serviceId, 'exp' => time() + GH_HOSTING_TTL]));
    $sig = gh_hosting_b64url(hash_hmac('sha256', $payload, GH_HOSTING_SECRET, true));
    $data = ['token' => $payload . '.' . $sig, 'sid' => $serviceId, 'panel' => $module];
    return '<script>window.GH_HOSTING=' . json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES) . ';</script>';
});

/**
 * Client-area language for public/hp/whmcs.js (English / Arabic skin and Manage hosting panel).
 * Prints window.GH_LANG (the WHMCS language name, e.g. "arabic") in <head> on every client-area page; for Arabic it also
 * sets <html lang="ar" dir="rtl"> right away so the page does not flash left-to-right before whmcs.js runs.
 * Needs "Allow clients to choose language" (Setup > General Settings > Localisation) for the English / العربية switch.
 */
add_hook('ClientAreaHeadOutput', 1, function ($vars) {
    $lang = strtolower((string) ($vars['language'] ?? ($_SESSION['Language'] ?? '')));
    if ($lang === '' || !preg_match('/^[a-z_-]{2,30}$/', $lang)) {
        return '';
    }
    $out = '<script>window.GH_LANG=' . json_encode($lang) . ';';
    if ($lang === 'arabic') {
        $out .= 'document.documentElement.setAttribute("lang","ar");document.documentElement.setAttribute("dir","rtl");';
    }
    return $out . '</script>';
});

/**
 * Search engines on my.globalhostia.com: one canonical URL per page, and no index for private / transactional pages.
 * Google Search Console listed many duplicate copies such as /knowledgebase/12/x.html?language=turkish,
 * /store/vps?currency=2 or /cart.php?a=add&pid=7&language=german ("Crawled / Discovered, currently not indexed",
 * "Duplicate without user-selected canonical"). This prints, in <head> of every client-area page:
 *   <link rel="canonical" href="https://my.globalhostia.com<path>[?essential params]">
 *   language, currency, carttpl, e, utm_* and every other parameter are dropped; only parameters that select the page
 *   itself are kept (rp for non-rewritten friendly URLs, action/id/catid on knowledgebase.php and announcements.php,
 *   gid/pid on the store/cart, page for pagination).
 *   <meta name="robots" content="noindex,follow"> on the cart and checkout, sign-in / sign-up / password reset, the
 *   client area, invoices, tickets, downloads, the "older announcements" archive, and on any ?language= other than
 *   english / arabic (the two languages globalhostia.com links to).
 * Upload with the rest of this file (includes/hooks/). Pair it with docs/whmcs/robots-my.txt.
 */
const GH_SEO_BASE = 'https://my.globalhostia.com';
const GH_SEO_KEEP = ['rp', 'action', 'id', 'catid', 'gid', 'pid', 'page'];

function gh_seo_route()
{
    $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
    $path = (string) parse_url($uri, PHP_URL_PATH);
    if ($path === '' || $path[0] !== '/') {
        $path = '/';
    }
    // the client area used to live at globalhostia.com/secure; canonical URLs are on my.globalhostia.com without it
    $path = preg_replace('#^/secure(?=/|$)#i', '', $path);
    if ($path === '') {
        $path = '/';
    }
    // friendly URLs without URL rewriting: index.php?rp=/knowledgebase/12/x.html
    $rp = isset($_GET['rp']) && is_string($_GET['rp']) ? $_GET['rp'] : '';
    return [$path, $rp];
}

add_hook('ClientAreaHeadOutput', 2, function ($vars) {
    list($path, $rp) = gh_seo_route();
    $route = strtolower(rtrim(($rp !== '' ? $rp : $path), '/'));
    $file = strtolower(basename($path));

    // canonical: path + only the parameters that define the page
    $keep = [];
    foreach (GH_SEO_KEEP as $k) {
        if (!isset($_GET[$k]) || !is_string($_GET[$k]) || $_GET[$k] === '') {
            continue;
        }
        $v = $_GET[$k];
        if ($k === 'rp') {
            if (!preg_match('#^/[A-Za-z0-9/._-]{0,200}$#', $v)) {
                continue;
            }
        } elseif (!preg_match('/^[A-Za-z0-9_-]{1,40}$/', $v)) {
            continue;
        }
        if ($k === 'page' && $v === '1') {
            continue;
        }
        $keep[$k] = $v;
    }
    $safePath = preg_match('#^/[A-Za-z0-9/._~%-]*$#', $path) ? $path : '/';
    $canonical = GH_SEO_BASE . $safePath . ($keep ? '?' . str_replace('%2F', '/', http_build_query($keep, '', '&', PHP_QUERY_RFC3986)) : '');

    // noindex: transactional, private and duplicate-language pages
    $noindex = false;
    $files = ['cart.php', 'register.php', 'pwreset.php', 'submitticket.php', 'login.php', 'dologin.php', 'logout.php',
        'clientarea.php', 'viewinvoice.php', 'viewquote.php', 'viewticket.php', 'supporttickets.php', 'dl.php', 'creditcard.php'];
    if (in_array($file, $files, true)) {
        $noindex = true;
    }
    if (preg_match('#^(/index\.php)?/(cart|checkout|register|login|logout|password|user|account|clientarea|store/order|announcements/view/older)(/|$)#', $route)) {
        $noindex = true;
    }
    if (preg_match('#/announcements/view/older#', $route)) {
        $noindex = true;
    }
    $lang = isset($_GET['language']) && is_string($_GET['language']) ? strtolower($_GET['language']) : '';
    if ($lang !== '' && !in_array($lang, ['english', 'arabic'], true)) {
        $noindex = true;
    }

    $out = '<link rel="canonical" href="' . htmlspecialchars($canonical, ENT_QUOTES, 'UTF-8') . '">';
    if ($noindex) {
        $out .= '<meta name="robots" content="noindex,follow">';
    }
    return $out;
});
