<?php
/**
 * GlobalHostia premium domains: read-only Dynadot proxy on the WHMCS server.
 *
 * ONE STEP: upload this file to the WHMCS root folder (next to init.php and cart.php), e.g.
 *   https://my.globalhostia.com/gh_dynadot_proxy.php
 * Nothing else to fill in when globalhostia_hosting_hook.php is already installed: the shared secret is read from it.
 * Check it in globalhostia.com/admin/premium-domains → "Test connection".
 *
 * Why: Dynadot only accepts API calls from whitelisted IPs. This WHMCS server (216.158.237.114) is already whitelisted
 * and WHMCS → System Settings → Domain Registrars → Dynadot already holds the API key, while globalhostia.com runs on
 * Vercel without a fixed IP. So globalhostia.com asks this file, and this file asks Dynadot.
 *
 * Security:
 *  - The Dynadot API key is read from the WHMCS registrar settings (decrypted by WHMCS) and never leaves this server:
 *    it is not in any response, error message or log line.
 *  - Every request must be signed: header X-GH-Signature: t=<unix>,v1=hex(HMAC-SHA256("gh-dynadot.v1.<t>.<raw body>", secret)),
 *    at most 5 minutes old. Secret = GH_DYNADOT_SECRET below, else GH_HOSTING_SECRET from includes/hooks/globalhostia_hosting_hook.php
 *    (the "WHMCS hook secret" in globalhostia.com/admin/hosting). Unsigned requests get 401.
 *  - Read-only commands only (search, get_listings, get_listing_item, list_domain), with an allow-list of parameters.
 *    Nothing that registers, buys, bids, renews or changes a domain can be called through this file.
 *  - At most 60 requests per minute.
 * Keep this file private (do not publish the secret). Delete it to switch the premium feed off at the source.
 */

// Optional overrides (leave as they are to use the defaults described above):
const GH_DYNADOT_SECRET = 'USE_GH_HOSTING_SECRET';   // or paste the value of the Vercel env DYNADOT_PROXY_SECRET (min 32 chars)
const GH_DYNADOT_API_KEY = 'USE_WHMCS_REGISTRAR';    // or paste a Dynadot API key (only if WHMCS does not hold one)
const GH_DYNADOT_MAX_PER_MINUTE = 60;

const GH_DYNADOT_COMMANDS = [
    'search' => ['show_price', 'currency', 'domain0', 'domain1', 'domain2', 'domain3', 'domain4', 'domain5', 'domain6', 'domain7', 'domain8', 'domain9',
        'domain10', 'domain11', 'domain12', 'domain13', 'domain14', 'domain15', 'domain16', 'domain17', 'domain18', 'domain19'],
    'get_listings' => ['currency', 'count_per_page', 'page_index', 'exclude_pending_sale', 'show_other_registrar'],
    'get_listing_item' => ['listing_id', 'currency'],
    'list_domain' => ['count_per_page', 'page_index'],
];

function gh_dd_out($code, array $data)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex');
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    gh_dd_out(405, ['ok' => false, 'error' => 'POST only']);
}

/** Shared secret: own constant, else GH_HOSTING_SECRET (defined, or read from the hosting hook file without running it). */
function gh_dd_secret()
{
    if (strlen(GH_DYNADOT_SECRET) >= 32 && strpos(GH_DYNADOT_SECRET, 'USE_') !== 0) {
        return GH_DYNADOT_SECRET;
    }
    if (defined('GH_HOSTING_SECRET') && strlen(GH_HOSTING_SECRET) >= 32 && strpos(GH_HOSTING_SECRET, 'PASTE_') !== 0) {
        return GH_HOSTING_SECRET;
    }
    $f = __DIR__ . '/includes/hooks/globalhostia_hosting_hook.php';
    if (is_readable($f) && preg_match("/const\\s+GH_HOSTING_SECRET\\s*=\\s*'([^']{32,})'/", (string) file_get_contents($f), $m) && strpos($m[1], 'PASTE_') !== 0) {
        return $m[1];
    }
    return '';
}

// 1. signature (before WHMCS is even loaded)
$body = (string) file_get_contents('php://input', false, null, 0, 8192);
$secret = gh_dd_secret();
if ($secret === '') {
    gh_dd_out(503, ['ok' => false, 'error' => 'Proxy secret not configured (install globalhostia_hosting_hook.php or set GH_DYNADOT_SECRET)']);
}
$hdr = (string) ($_SERVER['HTTP_X_GH_SIGNATURE'] ?? '');
if (!preg_match('/^t=(\d{9,11}),v1=([a-f0-9]{64})$/', $hdr, $sm) || abs(time() - (int) $sm[1]) > 300
    || !hash_equals(hash_hmac('sha256', 'gh-dynadot.v1.' . $sm[1] . '.' . $body, $secret), $sm[2])) {
    gh_dd_out(401, ['ok' => false, 'error' => 'Invalid or expired signature']);
}

// 2. request: one allowed command with allowed, simple parameters
$req = json_decode($body, true);
$cmd = is_array($req) ? (string) ($req['cmd'] ?? '') : '';
$params = is_array($req) && isset($req['params']) && is_array($req['params']) ? $req['params'] : [];
if (!isset(GH_DYNADOT_COMMANDS[$cmd])) {
    gh_dd_out(400, ['ok' => false, 'error' => 'Command not allowed']);
}
$query = [];
foreach ($params as $k => $v) {
    if (!in_array($k, GH_DYNADOT_COMMANDS[$cmd], true) || !is_scalar($v) || !preg_match('/^[A-Za-z0-9._-]{1,253}$/', (string) $v)) {
        gh_dd_out(400, ['ok' => false, 'error' => 'Parameter not allowed: ' . preg_replace('/[^a-z0-9_]/i', '', (string) $k)]);
    }
    $query[$k] = (string) $v;
}

// 3. rate limit (per minute, shared by all callers)
$rl = sys_get_temp_dir() . '/gh_dynadot_rl_' . substr(hash('sha256', __DIR__), 0, 12);
$win = (int) floor(time() / 60);
$cnt = 0;
$fh = @fopen($rl, 'c+');
if ($fh) {
    flock($fh, LOCK_EX);
    $raw = explode(':', (string) stream_get_contents($fh));
    $cnt = ((int) ($raw[0] ?? 0) === $win) ? (int) ($raw[1] ?? 0) : 0;
    $cnt++;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, $win . ':' . $cnt);
    flock($fh, LOCK_UN);
    fclose($fh);
}
if ($cnt > GH_DYNADOT_MAX_PER_MINUTE) {
    gh_dd_out(429, ['ok' => false, 'error' => 'Too many requests, try again in a minute']);
}

// 4. the Dynadot key from WHMCS → Domain Registrars → Dynadot (decrypted by WHMCS)
function gh_dd_key()
{
    if (strlen(GH_DYNADOT_API_KEY) >= 16 && strpos(GH_DYNADOT_API_KEY, 'USE_') !== 0) {
        return GH_DYNADOT_API_KEY;
    }
    require_once __DIR__ . '/init.php';
    if (!function_exists('getRegistrarConfigOptions')) {
        require_once ROOTDIR . '/includes/registrarfunctions.php';
    }
    $modules = ['dynadot'];
    try {
        $names = \WHMCS\Database\Capsule::table('tblregistrars')->where('registrar', 'like', '%dynadot%')->distinct()->pluck('registrar');
        foreach ($names as $n) {
            $modules[] = (string) $n;
        }
    } catch (\Throwable $e) {
    }
    foreach (array_unique($modules) as $mod) {
        try {
            $cfg = getRegistrarConfigOptions($mod);
        } catch (\Throwable $e) {
            continue;
        }
        if (!is_array($cfg)) {
            continue;
        }
        // the module's key setting: "apikey", "APIKey", "api_key", "Key" …
        foreach ($cfg as $name => $val) {
            if (is_string($val) && preg_match('/^(api[ _-]?key|key|apikey)$/i', (string) $name) && strlen(trim($val)) >= 16) {
                return trim($val);
            }
        }
        foreach ($cfg as $name => $val) {
            if (is_string($val) && preg_match('/key/i', (string) $name) && !preg_match('/secret|sandbox|test/i', (string) $name) && strlen(trim($val)) >= 16) {
                return trim($val);
            }
        }
    }
    return '';
}
$key = gh_dd_key();
if ($key === '') {
    gh_dd_out(503, ['ok' => false, 'error' => 'No Dynadot API key found in WHMCS → Domain Registrars → Dynadot']);
}

// 5. call Dynadot api3 (JSON) and pass its answer through
// (tests only: a local mock Dynadot on 127.0.0.1; production always calls api.dynadot.com)
$base = (string) getenv('GH_DYNADOT_TEST_BASE');
$base = preg_match('#^http://127\.0\.0\.1:\d+$#', $base) ? $base : 'https://api.dynadot.com';
$url = $base . '/api3.json?' . http_build_query(array_merge(['key' => $key, 'command' => $cmd], $query));
$ch = curl_init($url);
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 25, CURLOPT_USERAGENT => 'GlobalHostia-WHMCS-Proxy/1']);
$res = curl_exec($ch);
$http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);
if ($res === false || $res === '') {
    gh_dd_out(502, ['ok' => false, 'error' => 'Dynadot unreachable: ' . str_replace($key, '***', (string) $err)]);
}
$json = json_decode((string) $res, true);
if (!is_array($json)) {
    gh_dd_out(502, ['ok' => false, 'error' => 'Dynadot HTTP ' . $http . ': not JSON']);
}
// never echo the key back, whatever Dynadot puts in its answer
$clean = json_decode(str_replace($key, '***', json_encode($json, JSON_UNESCAPED_SLASHES)), true);
gh_dd_out(200, ['ok' => true, 'data' => $clean]);
