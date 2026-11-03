<?php
/**
 * CLI tests (no WHMCS needed): webhook signature verification against fixtures generated with
 * YouPI's own signing algorithm, order id parsing, money handling and masking.
 *
 *   php tests/run-tests.php
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}

require __DIR__ . '/../modules/gateways/youpi/bootstrap.php';

use GlobalHostia\YouPI\Config;
use GlobalHostia\YouPI\Money;
use GlobalHostia\YouPI\OrderId;
use GlobalHostia\YouPI\Signature;
use GlobalHostia\YouPI\Util;

$pass = 0;
$fail = 0;
function t(string $name, bool $cond, string $detail = ''): void
{
    global $pass, $fail;
    if ($cond) {
        $pass++;
        echo "  ok    {$name}\n";
    } else {
        $fail++;
        echo "  FAIL  {$name}" . ($detail !== '' ? " -- {$detail}" : '') . "\n";
    }
}

$fx = json_decode((string) file_get_contents(__DIR__ . '/fixtures/webhooks.json'), true);
if (!is_array($fx)) {
    fwrite(STDERR, "fixtures missing: run node tests/generate-fixtures.mjs\n");
    exit(1);
}

echo "Signature (fixtures from YouPI algorithm)\n";
foreach ($fx['cases'] as $c) {
    $r = Signature::verify($c['body'], $c['headers'], $fx['secret'], (int) $c['nowMs'], (int) $c['maxSkewSec'], (bool) $c['allowV1']);
    $okMatch = $r['ok'] === $c['expectOk'];
    $reasonMatch = $c['expectReason'] === '' || strpos($r['reason'], $c['expectReason']) !== false;
    t($c['name'], $okMatch && $reasonMatch, 'ok=' . var_export($r['ok'], true) . ' reason=' . $r['reason']);
}

echo "Signature (edge cases)\n";
$base = $fx['cases'][0];
$r = Signature::verify($base['body'], $base['headers'], '', (int) $base['nowMs'], 300, false);
t('empty secret rejected', !$r['ok'] && strpos($r['reason'], 'not configured') !== false);
$h = $base['headers'];
$h['x-gateway-signature-v2'] = strtoupper($h['x-gateway-signature-v2']);
$h['x-gateway-signature-v2'] = 'sha256=' . substr($h['x-gateway-signature-v2'], 7);
$r = Signature::verify($base['body'], $h, $fx['secret'], (int) $base['nowMs'], 300, false);
t('upper-case hex accepted', $r['ok'], $r['reason']);
$h = $base['headers'];
$h['x-gateway-signature-v2'] = 'sha256=zz';
$r = Signature::verify($base['body'], $h, $fx['secret'], (int) $base['nowMs'], 300, true);
t('malformed V2 is not rescued by V1 fallback', !$r['ok'] && strpos($r['reason'], 'malformed') !== false);
$h = $base['headers'];
unset($h['x-gateway-delivery-id']);
$r = Signature::verify($base['body'], $h, $fx['secret'], (int) $base['nowMs'], 300, false);
t('missing delivery id rejected', !$r['ok']);
$r = Signature::verify($base['body'] . ' ', $base['headers'], $fx['secret'], (int) $base['nowMs'], 300, false);
t('trailing whitespace changes the signature', !$r['ok']);
$r = Signature::verify(str_repeat('a', Signature::MAX_BODY_BYTES + 1), $base['headers'], $fx['secret'], (int) $base['nowMs'], 300, false);
t('oversized body rejected', !$r['ok']);
$server = [];
foreach ($base['headers'] as $k => $v) {
    $server['HTTP_' . strtoupper(str_replace('-', '_', $k))] = $v;
}
$server['REQUEST_METHOD'] = 'POST';
$r = Signature::verify($base['body'], Signature::headersFromServer($server), $fx['secret'], (int) $base['nowMs'], 300, false);
t('headers read from $_SERVER form', $r['ok'], $r['reason']);
$signed = Signature::signV2($base['body'], $fx['secret'], $base['headers']['x-gateway-timestamp']);
t('signV2 reproduces the YouPI header', hash_equals($base['headers']['x-gateway-signature-v2'], $signed));
t('verified payload exposes orderId', ($r['payload']['orderId'] ?? '') === 'WHMCS-1042-k3m7q2xa');

echo "Order ids\n";
foreach ($fx['orderIds']['valid'] as $id) {
    t("parse valid {$id}", OrderId::parse($id) !== null);
}
foreach ($fx['orderIds']['invalid'] as $id) {
    t('reject ' . json_encode($id), OrderId::parse($id) === null);
}
$p = OrderId::parse('WHMCS-1042-k3m7q2xa');
t('parse extracts invoice id and nonce', $p === ['invoiceId' => 1042, 'nonce' => 'k3m7q2xa']);
$seen = [];
for ($i = 0; $i < 500; $i++) {
    $n = OrderId::newNonce();
    $seen[$n] = true;
    if (OrderId::parse(OrderId::build(77, $n)) === null) {
        t('generated nonce round-trips', false, $n);
        break;
    }
}
t('500 nonces round-trip and are unique', count($seen) === 500);
t('build rejects bad nonce', (function () {
    try {
        OrderId::build(5, 'ABC');
        return false;
    } catch (\InvalidArgumentException $e) {
        return true;
    }
})());

echo "Money\n";
t('toPaise 499.00', Money::toPaise('499.00') === 49900);
t('toPaise 499.5', Money::toPaise('499.5') === 49950);
t('toPaise 0.01', Money::toPaise('0.01') === 1);
t('toPaise rejects 1.005', Money::toPaise('1.005') === null);
t('toPaise rejects -1', Money::toPaise('-1') === null);
t('toPaise rejects 1e3', Money::toPaise('1e3') === null);
t('paiseField int', Money::paiseField(149900) === 149900);
t('paiseField string', Money::paiseField('149900') === 149900);
t('paiseField rejects 1499.5', Money::paiseField(1499.5) === null);
t('fromDecimal float 0.1+0.2', Money::fromDecimal(0.1 + 0.2) === 30);
t('format', Money::format(149900) === '1499.00' && Money::format(5) === '0.05');
t('display Indian grouping', Money::display(12500000) === '1,25,000.00' && Money::display(99900) === '999.00');

echo "Util / Config\n";
t('UTR 12 digits valid', Util::validUtr('412345678901'));
t('UTR with spaces invalid', !Util::validUtr('4123 4567 8901'));
t('mask hides middle', Util::mask('mk_live_abcdef0123456789') === 'mk_l************89');
t('mask short secret fully', Util::mask('abc') === '***');
t('https only', Util::isHttpsUrl('https://pay.globalhostia.com') && !Util::isHttpsUrl('http://pay.globalhostia.com') && !Util::isHttpsUrl('https://u:p@x.com'));
t('origin', Util::origin('https://Pay.GlobalHostia.com:8443/checkout/x') === 'https://pay.globalhostia.com:8443');
t('indian mobile from +91.', Util::indianMobile('+91.98765 43210') === '9876543210' && Util::indianMobile('+1.5551234567') === '');
$cfg = Config::fromParams(['apiBaseUrl' => 'http://insecure.example', 'merchantId' => 'm1', 'merchantApiKey' => 'x', 'webhookSecret' => 'y', 'reviewAbove' => '5,000', 'maxWebhookAgeSeconds' => '5']);
t('config flags http API URL', in_array('YouPI API base URL must be an https:// URL', $cfg->problems(), true));
t('config parses review threshold with comma', $cfg->reviewAbovePaise === 500000);
t('config clamps skew to >= 30s', $cfg->maxSkewSeconds === 30);
t('config defaults acceptOnlyInr on', $cfg->acceptOnlyInr === true);
$bad = Config::fromParams(['brandColor' => 'red;background:url(x)']);
t('config rejects non-hex colour', $bad->brandColor === '#c5386f');
$loggable = Util::loggablePayload(['orderId' => 'x', 'metadata' => ['email' => 'a@b.c'], 'utr' => '1']);
t('loggable payload drops metadata', !isset($loggable['metadata']) && $loggable['orderId'] === 'x');

echo "\n{$pass} passed, {$fail} failed\n";
exit($fail === 0 ? 0 : 1);
