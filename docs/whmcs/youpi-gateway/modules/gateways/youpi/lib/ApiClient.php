<?php
/**
 * Minimal HTTPS client for the YouPI PG V2 payment API (pure PHP + curl).
 *
 * Endpoints used (YouPI openapi.yaml + apps/payment-api/src/routes/payments.routes.js):
 *   POST /api/v1/payments          headers X-Merchant-Id, X-Merchant-Key, Idempotency-Key
 *   GET  /api/v1/payments/{id}     header  X-Merchant-Key (owner view; without it only the public view is returned)
 */

namespace GlobalHostia\YouPI;

final class ApiClient
{
    /** @var string */
    private $baseUrl;
    /** @var string */
    private $merchantId;
    /** @var string */
    private $merchantKey;
    /** @var int */
    private $timeout;

    public function __construct(string $baseUrl, string $merchantId, string $merchantKey, int $timeoutSeconds = 10)
    {
        if (!Util::isHttpsUrl($baseUrl)) {
            throw new \InvalidArgumentException('YouPI API base URL must be an absolute https:// URL');
        }
        if ($merchantId === '' || $merchantKey === '') {
            throw new \InvalidArgumentException('YouPI merchant id and merchant API key are required');
        }
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->merchantId = $merchantId;
        $this->merchantKey = $merchantKey;
        $this->timeout = max(2, min(10, $timeoutSeconds));
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int, body:?array, error:?string, attempts:int}
     */
    public function createPayment(array $body, string $idempotencyKey, int $retries = 1): array
    {
        // A retry reuses the same Idempotency-Key and orderId, and YouPI returns the existing
        // session for a repeated orderId+amount, so retrying a lost response cannot double-create.
        return $this->request('POST', '/api/v1/payments', $body, ['Idempotency-Key: ' . $idempotencyKey], $retries);
    }

    /** @return array{status:int, body:?array, error:?string, attempts:int} */
    public function getPayment(string $paymentId, int $retries = 2): array
    {
        if (!Util::validPaymentId($paymentId)) {
            return ['status' => 0, 'body' => null, 'error' => 'invalid payment id', 'attempts' => 0];
        }
        return $this->request('GET', '/api/v1/payments/' . rawurlencode($paymentId), null, [], $retries);
    }

    /**
     * @param array<string,mixed>|null $body
     * @param string[] $extraHeaders
     * @return array{status:int, body:?array, error:?string, attempts:int}
     */
    private function request(string $method, string $path, ?array $body, array $extraHeaders, int $retries): array
    {
        $headers = array_merge([
            'Accept: application/json',
            'User-Agent: GlobalHostia-WHMCS-YouPI/1.0',
            'X-Merchant-Id: ' . $this->merchantId,
            'X-Merchant-Key: ' . $this->merchantKey,
        ], $extraHeaders);
        $payload = null;
        if ($body !== null) {
            $payload = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($payload === false) {
                return ['status' => 0, 'body' => null, 'error' => 'could not encode request', 'attempts' => 0];
            }
            $headers[] = 'Content-Type: application/json';
        }

        $attempt = 0;
        $last = ['status' => 0, 'body' => null, 'error' => 'not attempted', 'attempts' => 0];
        $maxAttempts = 1 + max(0, min(3, $retries));
        while ($attempt < $maxAttempts) {
            $attempt++;
            $last = $this->once($method, $this->baseUrl . $path, $headers, $payload);
            $last['attempts'] = $attempt;
            // Retry only transport failures and 502/504 (proxy hiccups). 503 from YouPI is a meaningful
            // "observers offline" answer, and 4xx answers will not change on retry.
            $transient = $last['status'] === 0 || $last['status'] === 502 || $last['status'] === 504;
            if (!$transient || $attempt >= $maxAttempts) {
                break;
            }
            usleep(250000 * $attempt);
        }
        return $last;
    }

    /**
     * @param string[] $headers
     * @return array{status:int, body:?array, error:?string, attempts:int}
     */
    private function once(string $method, string $url, array $headers, ?string $payload): array
    {
        $ch = curl_init();
        $opts = [
            CURLOPT_URL => $url,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => min(5, $this->timeout),
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ];
        if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTPS')) {
            $opts[CURLOPT_PROTOCOLS] = CURLPROTO_HTTPS;
        }
        if ($payload !== null) {
            $opts[CURLOPT_POSTFIELDS] = $payload;
        }
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = $raw === false ? curl_error($ch) : null;
        curl_close($ch);

        if ($raw === false) {
            return ['status' => 0, 'body' => null, 'error' => 'transport: ' . $err, 'attempts' => 1];
        }
        if (strlen($raw) > 262144) {
            return ['status' => $status, 'body' => null, 'error' => 'response too large', 'attempts' => 1];
        }
        $decoded = json_decode($raw, true);
        return [
            'status' => $status,
            'body' => is_array($decoded) ? $decoded : null,
            'error' => is_array($decoded) ? null : 'non-JSON response',
            'attempts' => 1,
        ];
    }
}
