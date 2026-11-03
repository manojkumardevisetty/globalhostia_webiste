<?php
/**
 * YouPI PG V2 webhook receiver for WHMCS.
 *
 * URL to configure in YouPI Merchant Admin:
 *   https://my.globalhostia.com/modules/gateways/callback/youpi.php
 *
 * Responses: 200 processed / duplicate / ignored; 400 malformed; 401 bad signature or stale;
 * 405 wrong method; 500 transient failure (YouPI retries the same delivery).
 */

require_once __DIR__ . '/../../../init.php';
require_once __DIR__ . '/../../../includes/gatewayfunctions.php';
require_once __DIR__ . '/../../../includes/invoicefunctions.php';
require_once __DIR__ . '/../youpi/bootstrap.php';

use GlobalHostia\YouPI\Config;
use GlobalHostia\YouPI\OrderId;
use GlobalHostia\YouPI\Processor;
use GlobalHostia\YouPI\Signature;
use GlobalHostia\YouPI\Store;
use GlobalHostia\YouPI\Util;

$gatewayModuleName = basename(__FILE__, '.php');

/** @param array<string,mixed> $body */
function youpi_respond(int $code, array $body): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode($body);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    youpi_respond(405, ['error' => 'method not allowed']);
}

$gatewayParams = getGatewayVariables($gatewayModuleName);
if (empty($gatewayParams['type'])) {
    youpi_respond(503, ['error' => 'module not activated']);
}
$cfg = Config::fromParams($gatewayParams);

$length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($length > Signature::MAX_BODY_BYTES) {
    youpi_respond(413, ['error' => 'payload too large']);
}
$rawBody = (string) file_get_contents('php://input', false, null, 0, Signature::MAX_BODY_BYTES + 1);

$headers = Signature::headersFromServer($_SERVER);
$nowMs = (int) floor(microtime(true) * 1000);
$check = Signature::verify($rawBody, $headers, $cfg->webhookSecret, $nowMs, $cfg->maxSkewSeconds, $cfg->allowV1);

if (!$check['ok']) {
    // Never log the body of an unauthenticated request in full; signatures are masked.
    logTransaction($gatewayParams['name'], [
        '_outcome' => 'Rejected: ' . $check['reason'],
        'deliveryId' => substr((string) ($headers['x-gateway-delivery-id'] ?? ''), 0, 64),
        'event' => substr((string) ($headers['x-gateway-event'] ?? ''), 0, 32),
        'timestamp' => substr((string) ($headers['x-gateway-timestamp'] ?? ''), 0, 16),
        'signatureV2' => Util::mask($headers['x-gateway-signature-v2'] ?? ''),
        'remoteAddr' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        'bytes' => strlen($rawBody),
    ], 'Invalid Signature');
    $isMalformed = strpos($check['reason'], 'body is not') === 0 || strpos($check['reason'], 'empty or oversized') === 0;
    youpi_respond($isMalformed ? 400 : 401, ['error' => 'signature verification failed']);
}

$payload = $check['payload'];
$deliveryId = $check['deliveryId'];
$orderId = (string) ($payload['orderId'] ?? '');
$event = strtoupper((string) ($payload['event'] ?? ''));

if (OrderId::parse($orderId) === null) {
    logTransaction($gatewayParams['name'], Util::loggablePayload($payload) + ['_outcome' => 'Rejected: orderId not issued by this module'], 'Rejected');
    // Signed by our merchant secret but not a WHMCS order: acknowledge so YouPI stops retrying.
    youpi_respond(200, ['received' => true, 'ignored' => true]);
}

try {
    Store::ensureSchema();
    if (!Store::claimDelivery($deliveryId, $orderId, $event)) {
        logTransaction($gatewayParams['name'], Util::loggablePayload($payload) + ['_outcome' => 'Duplicate delivery ignored'], 'Duplicate');
        youpi_respond(200, ['received' => true, 'duplicate' => true]);
    }
} catch (\Throwable $e) {
    logActivity('[YouPI] webhook storage error: ' . substr($e->getMessage(), 0, 200));
    youpi_respond(500, ['error' => 'temporary failure']);
}

try {
    $result = Processor::handle($gatewayParams, $cfg, $payload, 'webhook');
    Store::finishDelivery($deliveryId, $result['outcome']);
} catch (\Throwable $e) {
    // Let YouPI's retry run the same delivery again.
    try {
        Store::forgetDelivery($deliveryId);
    } catch (\Throwable $ignored) {
    }
    logTransaction($gatewayParams['name'], Util::loggablePayload($payload) + ['_outcome' => 'Error: ' . substr($e->getMessage(), 0, 200)], 'Error');
    youpi_respond(500, ['error' => 'temporary failure']);
}

youpi_respond($result['http'] >= 400 ? $result['http'] : 200, ['received' => true, 'outcome' => $result['http'] >= 400 ? 'rejected' : 'ok']);
