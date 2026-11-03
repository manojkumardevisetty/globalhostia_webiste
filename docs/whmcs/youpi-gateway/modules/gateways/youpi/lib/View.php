<?php
/**
 * HTML for the invoice page. Everything interpolated is escaped; no secrets are ever rendered.
 */

namespace GlobalHostia\YouPI;

final class View
{
    private static function e($s): string
    {
        return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private static function hex(string $color): string
    {
        // GlobalHostia hexagon mark (same geometry as the site's logo motif).
        return '<svg class="ghy-hex" viewBox="0 0 84 96" width="28" height="32" aria-hidden="true" focusable="false">'
            . '<path d="M42 2 82 25v46L42 94 2 71V25Z" fill="' . self::e($color) . '"/>'
            . '<path d="M42 22 64 35v26L42 74 20 61V35Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>'
            . '</svg>';
    }

    private static function assets(string $systemUrl): string
    {
        $base = rtrim($systemUrl, '/') . '/modules/gateways/youpi/assets/';
        $v = defined('YOUPI_GATEWAY_VERSION') ? YOUPI_GATEWAY_VERSION : '1';
        return '<link rel="stylesheet" href="' . self::e($base . 'youpi.css?v=' . $v) . '">'
            . '<script src="' . self::e($base . 'youpi.js?v=' . $v) . '" defer></script>';
    }

    private static function shell(Config $cfg, string $systemUrl, string $inner, string $mod = ''): string
    {
        return self::assets($systemUrl)
            . '<div class="ghy' . ($mod !== '' ? ' ghy--' . self::e($mod) : '') . '" style="--ghy-brand:' . self::e($cfg->brandColor) . '">'
            . '<div class="ghy__head">' . self::hex($cfg->brandColor)
            . '<div><div class="ghy__brand">' . self::e($cfg->brandName) . '</div><div class="ghy__sub">UPI payment</div></div></div>'
            . $inner
            . ($cfg->testMode ? '<p class="ghy__test">Test mode: only visible to staff.</p>' : '')
            . '</div>';
    }

    /** A message instead of the pay button (unavailable, under review, confirming). */
    public static function notice(Config $cfg, string $systemUrl, string $title, string $body, string $kind = 'info'): string
    {
        $inner = '<p class="ghy__title">' . self::e($title) . '</p><p class="ghy__text">' . self::e($body) . '</p>';
        if ($cfg->supportUrl !== '' && $kind === 'warn') {
            $inner .= '<p class="ghy__text"><a href="' . self::e($cfg->supportUrl) . '" target="_blank" rel="noopener">Contact billing support</a></p>';
        }
        return self::shell($cfg, $systemUrl, $inner, $kind);
    }

    public static function payButton(Config $cfg, string $systemUrl, string $checkoutUrl, int $amountPaise, int $invoiceId): string
    {
        $copy = $cfg->confirmOn === Config::CONFIRM_RECONCILED
            ? 'We check every UPI payment against our bank statement before marking the invoice paid. This is usually done within one business day.'
            : 'Payment is confirmed automatically once your bank confirms it — usually within a minute.';
        $inner = '<p class="ghy__amount"><span>Amount</span> <b>&#8377;' . self::e(Money::display($amountPaise)) . '</b></p>'
            . '<button type="button" class="ghy__btn" data-ghy-pay'
            . ' data-checkout-url="' . self::e($checkoutUrl) . '"'
            . ' data-checkout-origin="' . self::e(Util::origin($checkoutUrl)) . '"'
            . ' data-mode="' . self::e($cfg->checkoutMode) . '"'
            . ' data-invoice="' . (int) $invoiceId . '">'
            . self::e($cfg->buttonLabel) . '</button>'
            . '<p class="ghy__text">' . self::e($copy) . '</p>'
            . '<p class="ghy__fine">Scan the QR code or tap your UPI app (Google Pay, PhonePe, Paytm, BHIM and others) on the next screen. '
            . 'Pay the exact amount shown and do not close the page until it says the payment was received.</p>'
            . '<p class="ghy__fine"><a href="' . self::e($checkoutUrl) . '" target="_blank" rel="noopener" data-ghy-newtab>Open the payment page in a new tab</a></p>'
            . '<div class="ghy__status" role="status" aria-live="polite" data-ghy-status hidden></div>';
        return self::shell($cfg, $systemUrl, $inner);
    }
}
