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
