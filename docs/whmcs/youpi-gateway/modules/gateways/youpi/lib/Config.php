<?php
/**
 * Typed view of the gateway settings saved in Setup > Payments > Payment Gateways.
 */

namespace GlobalHostia\YouPI;

final class Config
{
    const CONFIRM_OBSERVED = 'observed';
    const CONFIRM_RECONCILED = 'reconciled';

    /** @var string */ public $apiBaseUrl = '';
    /** @var string */ public $checkoutPortalUrl = '';
    /** @var string */ public $merchantId = '';
    /** @var string */ public $merchantApiKey = '';
    /** @var string */ public $webhookSecret = '';
    /** @var bool */   public $allowV1 = false;
    /** @var int */    public $maxSkewSeconds = 300;
    /** @var bool */   public $acceptOnlyInr = true;
    /** @var int */    public $minPaise = 100;
    /** @var int */    public $maxPaise = 0;
    /** @var int */    public $reviewAbovePaise = 0;
    /** @var string */ public $confirmOn = self::CONFIRM_OBSERVED;
    /** @var string */ public $checkoutMode = 'modal';
    /** @var bool */   public $testMode = false;
    /** @var string */ public $brandName = 'GlobalHostia';
    /** @var string */ public $buttonLabel = 'Pay with UPI';
    /** @var string */ public $brandColor = '#c5386f';
    /** @var string */ public $supportUrl = '';

    /** @param array<string,mixed> $p WHMCS gateway params / getGatewayVariables() */
    public static function fromParams(array $p): self
    {
        $c = new self();
        $c->apiBaseUrl = rtrim(trim((string) ($p['apiBaseUrl'] ?? '')), '/');
        $c->checkoutPortalUrl = rtrim(trim((string) ($p['checkoutPortalUrl'] ?? '')), '/');
        $c->merchantId = trim((string) ($p['merchantId'] ?? ''));
        $c->merchantApiKey = trim((string) ($p['merchantApiKey'] ?? ''));
        $c->webhookSecret = trim((string) ($p['webhookSecret'] ?? ''));
        $c->allowV1 = self::yes($p['allowV1Signature'] ?? '');
        $c->maxSkewSeconds = self::intIn($p['maxWebhookAgeSeconds'] ?? '', 300, 30, 7200);
        $c->acceptOnlyInr = !array_key_exists('acceptOnlyInr', $p) || self::yes($p['acceptOnlyInr']);
        $c->minPaise = self::rupeesToPaise($p['minAmount'] ?? '', 100);
        $c->maxPaise = self::rupeesToPaise($p['maxAmount'] ?? '', 0);
        $c->reviewAbovePaise = self::rupeesToPaise($p['reviewAbove'] ?? '', 0);
        $c->confirmOn = (($p['confirmOn'] ?? '') === self::CONFIRM_RECONCILED) ? self::CONFIRM_RECONCILED : self::CONFIRM_OBSERVED;
        $c->checkoutMode = (($p['checkoutMode'] ?? '') === 'redirect') ? 'redirect' : 'modal';
        $c->testMode = self::yes($p['testMode'] ?? '');
        $c->brandName = self::text($p['brandName'] ?? '', 'GlobalHostia', 60);
        $c->buttonLabel = self::text($p['buttonLabel'] ?? '', 'Pay with UPI', 40);
        $color = trim((string) ($p['brandColor'] ?? ''));
        $c->brandColor = preg_match('/^#[0-9a-fA-F]{6}$/', $color) ? strtolower($color) : '#c5386f';
        $support = trim((string) ($p['supportUrl'] ?? ''));
        $c->supportUrl = Util::isHttpsUrl($support) ? $support : '';
        return $c;
    }

    /** @return string[] human-readable problems; empty when the API side is usable */
    public function problems(): array
    {
        $out = [];
        if (!Util::isHttpsUrl($this->apiBaseUrl)) {
            $out[] = 'YouPI API base URL must be an https:// URL';
        }
        if ($this->checkoutPortalUrl !== '' && !Util::isHttpsUrl($this->checkoutPortalUrl)) {
            $out[] = 'Checkout portal URL must be an https:// URL';
        }
        if ($this->merchantId === '' || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $this->merchantId)) {
            $out[] = 'Merchant ID is missing or malformed';
        }
        if (strlen($this->merchantApiKey) < 16) {
            $out[] = 'Merchant API key is missing';
        }
        if (strlen($this->webhookSecret) < 16) {
            $out[] = 'Webhook signing secret is missing';
        }
        if ($this->maxPaise > 0 && $this->maxPaise < $this->minPaise) {
            $out[] = 'Maximum amount is below the minimum amount';
        }
        return $out;
    }

    public function client(): ApiClient
    {
        return new ApiClient($this->apiBaseUrl, $this->merchantId, $this->merchantApiKey, 10);
    }

    /** Allowed origin for checkout URLs returned by the API. */
    public function portalOrigin(): string
    {
        return Util::origin($this->checkoutPortalUrl !== '' ? $this->checkoutPortalUrl : $this->apiBaseUrl);
    }

    /** @param mixed $v */
    private static function yes($v): bool
    {
        return in_array(strtolower(trim((string) $v)), ['on', 'yes', '1', 'true'], true);
    }

    /** @param mixed $v */
    private static function intIn($v, int $default, int $min, int $max): int
    {
        $s = trim((string) $v);
        if (!preg_match('/^\d{1,6}$/', $s)) {
            return $default;
        }
        return max($min, min($max, (int) $s));
    }

    /** @param mixed $v */
    private static function rupeesToPaise($v, int $default): int
    {
        $s = str_replace([',', ' '], '', trim((string) $v));
        if ($s === '') {
            return $default;
        }
        $p = Money::toPaise($s);
        return $p === null ? $default : $p;
    }

    /** @param mixed $v */
    private static function text($v, string $default, int $max): string
    {
        $s = trim(preg_replace('/[\x00-\x1F\x7F]+/', ' ', (string) $v));
        if ($s === '') {
            return $default;
        }
        return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
    }
}
