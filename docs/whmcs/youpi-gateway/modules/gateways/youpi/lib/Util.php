<?php
/**
 * Pure helpers (no WHMCS dependency): order ids, money in paise, UTR validation, masking.
 */

namespace GlobalHostia\YouPI;

final class OrderId
{
    /** Order ids are "WHMCS-<invoiceid>-<nonce>"; nonce is lower-case base32 so YouPI's "-R<n>" retry suffix rule never matches. */
    const PATTERN = '/^WHMCS-([1-9][0-9]{0,9})-([a-z2-7]{8})$/';

    public static function build(int $invoiceId, string $nonce): string
    {
        if ($invoiceId < 1 || !preg_match('/^[a-z2-7]{8}$/', $nonce)) {
            throw new \InvalidArgumentException('invalid invoice id or nonce');
        }
        return 'WHMCS-' . $invoiceId . '-' . $nonce;
    }

    /** @return array{invoiceId:int, nonce:string}|null */
    public static function parse($orderId): ?array
    {
        if (!is_string($orderId) || strlen($orderId) > 40 || !preg_match(self::PATTERN, $orderId, $m)) {
            return null;
        }
        return ['invoiceId' => (int) $m[1], 'nonce' => $m[2]];
    }

    public static function newNonce(): string
    {
        $alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
        $bytes = random_bytes(8);
        $out = '';
        for ($i = 0; $i < 8; $i++) {
            $out .= $alphabet[ord($bytes[$i]) & 31];
        }
        return $out;
    }
}

final class Money
{
    /**
     * Exact decimal string ("499", "499.5", "499.00") -> integer paise. No floats involved.
     * @param mixed $value
     */
    public static function toPaise($value): ?int
    {
        if (is_int($value)) {
            return $value >= 0 ? $value * 100 : null;
        }
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        if (!preg_match('/^(\d{1,12})(?:\.(\d{1,2}))?$/', $value, $m)) {
            return null;
        }
        $frac = isset($m[2]) ? str_pad($m[2], 2, '0') : '00';
        return ((int) $m[1]) * 100 + (int) $frac;
    }

    /** Integer paise field from a payload (int or digit string). @param mixed $value */
    public static function paiseField($value): ?int
    {
        if (is_int($value) && $value >= 0) {
            return $value;
        }
        if (is_string($value) && preg_match('/^\d{1,14}$/', $value)) {
            return (int) $value;
        }
        if (is_float($value) && $value >= 0 && floor($value) === $value && $value < 1e14) {
            return (int) $value;
        }
        return null;
    }

    /** DB decimal (string/float) -> paise, rounding half away from zero at 2dp. @param mixed $value */
    public static function fromDecimal($value): int
    {
        $exact = self::toPaise(is_string($value) ? $value : number_format((float) $value, 2, '.', ''));
        if ($exact !== null) {
            return $exact;
        }
        return (int) round(((float) $value) * 100);
    }

    public static function format(int $paise): string
    {
        $sign = $paise < 0 ? '-' : '';
        $paise = abs($paise);
        return $sign . intdiv($paise, 100) . '.' . str_pad((string) ($paise % 100), 2, '0', STR_PAD_LEFT);
    }

    /** Indian digit grouping for display: 125000.00 -> 1,25,000.00 */
    public static function display(int $paise): string
    {
        $s = self::format($paise);
        [$int, $dec] = explode('.', $s);
        if (strlen($int) > 3) {
            $last3 = substr($int, -3);
            $rest = substr($int, 0, -3);
            $rest = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest);
            $int = $rest . ',' . $last3;
        }
        return $int . '.' . $dec;
    }
}

final class Util
{
    /** UTR / bank reference: YouPI accepts [A-Za-z0-9-]{6,35}; real UPI UTRs are 12 digits. */
    public static function validUtr($utr): bool
    {
        return is_string($utr) && preg_match('/^[A-Za-z0-9-]{6,35}$/', $utr) === 1;
    }

    /** Masks a secret for logs: keeps a short prefix and the last 2 characters. */
    public static function mask($secret): string
    {
        $secret = (string) $secret;
        $len = strlen($secret);
        if ($len === 0) {
            return '(empty)';
        }
        if ($len <= 8) {
            return str_repeat('*', $len);
        }
        return substr($secret, 0, 4) . str_repeat('*', min(12, $len - 6)) . substr($secret, -2);
    }

    /** True for an absolute https:// URL without credentials or fragments. */
    public static function isHttpsUrl($url): bool
    {
        if (!is_string($url) || $url === '' || strlen($url) > 512) {
            return false;
        }
        $p = parse_url($url);
        return is_array($p)
            && strtolower($p['scheme'] ?? '') === 'https'
            && !empty($p['host'])
            && !isset($p['user']) && !isset($p['pass']) && !isset($p['fragment']);
    }

    /** scheme://host[:port] of a URL, lower-cased, or '' */
    public static function origin($url): string
    {
        $p = is_string($url) ? parse_url($url) : false;
        if (!is_array($p) || empty($p['scheme']) || empty($p['host'])) {
            return '';
        }
        $o = strtolower($p['scheme']) . '://' . strtolower($p['host']);
        if (isset($p['port'])) {
            $o .= ':' . (int) $p['port'];
        }
        return $o;
    }

    /** Payment-session UUIDs as issued by YouPI. */
    public static function validPaymentId($id): bool
    {
        return is_string($id) && preg_match('/^[A-Za-z0-9-]{8,64}$/', $id) === 1;
    }

    /** Indian mobile number from a WHMCS phone field ("+91.98765 43210") or ''. */
    public static function indianMobile($phone): string
    {
        $digits = preg_replace('/\D+/', '', (string) $phone);
        if (strlen($digits) === 12 && strpos($digits, '91') === 0) {
            $digits = substr($digits, 2);
        } elseif (strlen($digits) === 11 && $digits[0] === '0') {
            $digits = substr($digits, 1);
        }
        return preg_match('/^[6-9]\d{9}$/', $digits) ? $digits : '';
    }

    /**
     * Strips anything we must not keep in the WHMCS gateway log (customer contact data in metadata).
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    public static function loggablePayload(array $payload): array
    {
        $keep = ['event', 'deliveryId', 'timestamp', 'paymentId', 'orderId', 'attemptId', 'amount', 'amountPaise',
            'currency', 'method', 'utr', 'verificationTag', 'verificationLevel', 'completedAt', 'settlementState', 'status',
            'internalStatus'];
        $out = [];
        foreach ($keep as $k) {
            if (array_key_exists($k, $payload) && (is_scalar($payload[$k]) || $payload[$k] === null)) {
                $out[$k] = $payload[$k];
            }
        }
        return $out;
    }
}
