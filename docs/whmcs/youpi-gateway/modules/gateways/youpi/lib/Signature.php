<?php
/**
 * YouPI webhook signature verification (pure PHP, no WHMCS dependency).
 *
 * Mirrors YouPI PG V2 packages/core/src/webhook-engine.js:
 *   X-Gateway-Signature    = "sha256=" . HMAC_SHA256(secret, rawBody)                       (V1)
 *   X-Gateway-Signature-V2 = "sha256=" . HMAC_SHA256(secret, "<timestamp_ms>.<rawBody>")    (V2)
 *   X-Gateway-Timestamp    = epoch milliseconds of the FIRST signing (retries resend it unchanged)
 *   X-Gateway-Delivery-Id  = UUID, stable across retries
 * The JSON body also carries "timestamp" and "deliveryId", which must equal the headers.
 */

namespace GlobalHostia\YouPI;

final class Signature
{
    const MAX_BODY_BYTES = 65536;

    /**
     * Lower-cases header names from a $_SERVER-style array (HTTP_X_GATEWAY_TIMESTAMP => x-gateway-timestamp)
     * or from an already header-shaped array.
     *
     * @param array<string,mixed> $server
     * @return array<string,string>
     */
    public static function headersFromServer(array $server): array
    {
        $out = [];
        foreach ($server as $key => $value) {
            if (!is_string($key) || !is_scalar($value)) {
                continue;
            }
            if (strpos($key, 'HTTP_') === 0) {
                $name = strtolower(str_replace('_', '-', substr($key, 5)));
            } else {
                $name = strtolower($key);
            }
            $out[$name] = trim((string) $value);
        }
        return $out;
    }

    /**
     * Verifies a webhook delivery.
     *
     * @param string               $rawBody      exact request bytes (never re-encoded JSON)
     * @param array<string,string> $headers      lower-cased header map
     * @param string               $secret       merchant webhook secret
     * @param int                  $nowMs        current epoch milliseconds
     * @param int                  $maxSkewSec   maximum |now - timestamp| in seconds
     * @param bool                 $allowV1      accept the legacy body-only signature when V2 is absent
     * @return array{ok:bool, scheme:string, reason:string, payload:?array, timestampMs:?int, deliveryId:string}
     */
    public static function verify(string $rawBody, array $headers, string $secret, int $nowMs, int $maxSkewSec, bool $allowV1 = false): array
    {
        $result = ['ok' => false, 'scheme' => 'none', 'reason' => '', 'payload' => null, 'timestampMs' => null, 'deliveryId' => ''];

        if ($secret === '') {
            $result['reason'] = 'webhook secret is not configured';
            return $result;
        }
        if ($rawBody === '' || strlen($rawBody) > self::MAX_BODY_BYTES) {
            $result['reason'] = 'empty or oversized body';
            return $result;
        }

        $v2 = $headers['x-gateway-signature-v2'] ?? '';
        $v1 = $headers['x-gateway-signature'] ?? '';
        $tsHeader = $headers['x-gateway-timestamp'] ?? '';
        $deliveryId = $headers['x-gateway-delivery-id'] ?? '';

        if ($deliveryId === '' || !preg_match('/^[A-Za-z0-9-]{8,64}$/', $deliveryId)) {
            $result['reason'] = 'missing or malformed X-Gateway-Delivery-Id';
            return $result;
        }
        $result['deliveryId'] = $deliveryId;

        $timestampMs = null;
        if ($v2 !== '') {
            $hex = self::parseSignatureHeader($v2);
            if ($hex === null) {
                $result['reason'] = 'malformed X-Gateway-Signature-V2';
                return $result;
            }
            if (!preg_match('/^\d{10,16}$/', $tsHeader)) {
                $result['reason'] = 'missing or malformed X-Gateway-Timestamp';
                return $result;
            }
            $expected = hash_hmac('sha256', $tsHeader . '.' . $rawBody, $secret);
            if (!hash_equals($expected, $hex)) {
                $result['reason'] = 'V2 signature mismatch';
                return $result;
            }
            $result['scheme'] = 'v2';
            $timestampMs = (int) $tsHeader;
        } elseif ($allowV1 && $v1 !== '') {
            $hex = self::parseSignatureHeader($v1);
            if ($hex === null) {
                $result['reason'] = 'malformed X-Gateway-Signature';
                return $result;
            }
            $expected = hash_hmac('sha256', $rawBody, $secret);
            if (!hash_equals($expected, $hex)) {
                $result['reason'] = 'V1 signature mismatch';
                return $result;
            }
            $result['scheme'] = 'v1';
            // V1 does not bind the header timestamp; freshness is taken from the signed body below.
        } else {
            $result['reason'] = $v1 !== '' ? 'V2 signature missing and V1 fallback is disabled' : 'no signature header';
            return $result;
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            $result['reason'] = 'body is not a JSON object';
            return $result;
        }

        // The signed body must agree with the headers (YouPI resends body + headers byte for byte).
        $bodyTs = $payload['timestamp'] ?? null;
        if (!is_int($bodyTs) && !(is_string($bodyTs) && preg_match('/^\d{10,16}$/', $bodyTs))) {
            $result['reason'] = 'body timestamp missing';
            return $result;
        }
        $bodyTs = (int) $bodyTs;
        if ($timestampMs !== null && $bodyTs !== $timestampMs) {
            $result['reason'] = 'body timestamp does not match X-Gateway-Timestamp';
            return $result;
        }
        if ($timestampMs === null) {
            $timestampMs = $bodyTs;
        }
        if (!isset($payload['deliveryId']) || !is_string($payload['deliveryId']) || !hash_equals($payload['deliveryId'], $deliveryId)) {
            $result['reason'] = 'body deliveryId does not match X-Gateway-Delivery-Id';
            return $result;
        }

        $skewMs = abs($nowMs - $timestampMs);
        if ($skewMs > max(1, $maxSkewSec) * 1000) {
            $result['reason'] = 'timestamp outside the allowed window (' . (int) floor($skewMs / 1000) . 's skew)';
            $result['timestampMs'] = $timestampMs;
            return $result;
        }

        $result['ok'] = true;
        $result['payload'] = $payload;
        $result['timestampMs'] = $timestampMs;
        return $result;
    }

    /** "sha256=<64 hex>" -> lower-case hex, or null. */
    public static function parseSignatureHeader(string $value): ?string
    {
        if (!preg_match('/^sha256=([0-9a-fA-F]{64})$/', trim($value), $m)) {
            return null;
        }
        return strtolower($m[1]);
    }

    /** Builds V2 headers exactly like YouPI's webhook engine (used by tests and the self-test). */
    public static function signV2(string $rawBody, string $secret, string $timestampMs): string
    {
        return 'sha256=' . hash_hmac('sha256', $timestampMs . '.' . $rawBody, $secret);
    }
}
