<?php
/**
 * YouPI UPI payment gateway for WHMCS 8.13 (GlobalHostia).
 *
 * Third Party Gateway module: the customer pays on a self-hosted YouPI PG V2 checkout,
 * and the signed webhook (modules/gateways/callback/youpi.php) applies the payment.
 *
 * @see https://developers.whmcs.com/payment-gateways/third-party-gateway/
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

require_once __DIR__ . '/youpi/bootstrap.php';

use GlobalHostia\YouPI\Config;
use GlobalHostia\YouPI\Money;
use GlobalHostia\YouPI\Store;
use GlobalHostia\YouPI\Util;
use GlobalHostia\YouPI\View;

function youpi_MetaData()
{
    return [
        'DisplayName' => 'YouPI UPI (self-hosted)',
        'APIVersion' => '1.1',
        'DisableLocalCreditCardInput' => true,
        'TokenisedStorage' => false,
    ];
}

function youpi_config()
{
    return [
        'FriendlyName' => [
            'Type' => 'System',
            'Value' => 'YouPI UPI (self-hosted)',
        ],
        'apiBaseUrl' => [
            'FriendlyName' => 'YouPI API base URL',
            'Type' => 'text',
            'Size' => '60',
            'Default' => 'https://pay.globalhostia.com',
            'Description' => 'https:// only. Your YouPI checkout portal (it proxies /api/*) or the payment API origin. No trailing path.',
        ],
        'checkoutPortalUrl' => [
            'FriendlyName' => 'Checkout portal URL',
            'Type' => 'text',
            'Size' => '60',
            'Default' => 'https://pay.globalhostia.com',
            'Description' => 'Origin customers are sent to. Checkout links returned by the API must be on this origin.',
        ],
        'merchantId' => [
            'FriendlyName' => 'Merchant ID',
            'Type' => 'text',
            'Size' => '40',
            'Description' => 'Sent as X-Merchant-Id (merchant UUID or slug from YouPI Merchant Admin).',
        ],
        'merchantApiKey' => [
            'FriendlyName' => 'Merchant API key',
            'Type' => 'password',
            'Size' => '60',
            'Description' => 'Server-side key (mk_live_...), sent as X-Merchant-Key. Never shown to customers.',
        ],
        'webhookSecret' => [
            'FriendlyName' => 'Webhook signing secret',
            'Type' => 'password',
            'Size' => '60',
            'Description' => 'The merchant webhook secret from YouPI. Webhook URL: https://my.globalhostia.com/modules/gateways/callback/youpi.php',
        ],
        'maxWebhookAgeSeconds' => [
            'FriendlyName' => 'Max webhook age (seconds)',
            'Type' => 'text',
            'Size' => '6',
            'Default' => '300',
            'Description' => 'Reject deliveries whose signed timestamp is older/newer than this. YouPI retries reuse the first timestamp, so late retries are rejected and the reconciler takes over.',
        ],
        'allowV1Signature' => [
            'FriendlyName' => 'Allow legacy V1 signature',
            'Type' => 'yesno',
            'Description' => 'Only if your YouPI build does not send X-Gateway-Signature-V2. Freshness is then taken from the signed body timestamp.',
        ],
        'confirmOn' => [
            'FriendlyName' => 'Mark invoice paid on',
            'Type' => 'dropdown',
            'Options' => [
                'observed' => 'OBSERVED_SUCCESS (bank alert seen, fast, not statement-reconciled)',
                'reconciled' => 'RECONCILED only (after a bank statement import in YouPI, safest)',
            ],
            'Default' => 'observed',
            'Description' => 'YouPI recommends RECONCILED for fulfilment. OBSERVED is faster but relies on SMS/email alert parsing.',
        ],
        'acceptOnlyInr' => [
            'FriendlyName' => 'Accept only INR invoices',
            'Type' => 'yesno',
            'Default' => 'on',
            'Description' => 'Refuse invoices whose currency is not INR. If off, set "Convert To For Processing" = INR so other currencies are converted.',
        ],
        'minAmount' => [
            'FriendlyName' => 'Minimum amount (INR)',
            'Type' => 'text',
            'Size' => '10',
            'Default' => '1.00',
        ],
        'maxAmount' => [
            'FriendlyName' => 'Maximum amount (INR)',
            'Type' => 'text',
            'Size' => '10',
            'Default' => '100000',
            'Description' => 'Leave empty for no maximum. UPI apps and banks apply their own per-transaction limits.',
        ],
        'reviewAbove' => [
            'FriendlyName' => 'Hold for manual review above (INR)',
            'Type' => 'text',
            'Size' => '10',
            'Default' => '5000',
            'Description' => 'Payments above this are NOT marked paid automatically; staff get an email and the client sees a pending note. Empty or 0 = off.',
        ],
        'checkoutMode' => [
            'FriendlyName' => 'Checkout display',
            'Type' => 'dropdown',
            'Options' => [
                'modal' => 'Embedded window on the invoice (needs CHECKOUT_FRAME_ANCESTORS on YouPI)',
                'redirect' => 'Redirect to the YouPI checkout page',
            ],
            'Default' => 'modal',
            'Description' => 'Phones always use the full page so UPI app links work.',
        ],
        'testMode' => [
            'FriendlyName' => 'Test mode',
            'Type' => 'yesno',
            'Description' => 'Show the UPI option only to logged-in WHMCS staff (use an admin "Login as Client" session).',
        ],
        'brandName' => [
            'FriendlyName' => 'Brand name',
            'Type' => 'text',
            'Size' => '30',
            'Default' => 'GlobalHostia',
        ],
        'buttonLabel' => [
            'FriendlyName' => 'Button label',
            'Type' => 'text',
            'Size' => '30',
            'Default' => 'Pay with UPI',
        ],
        'brandColor' => [
            'FriendlyName' => 'Brand colour',
            'Type' => 'text',
            'Size' => '8',
            'Default' => '#c5386f',
        ],
        'supportUrl' => [
            'FriendlyName' => 'Billing support URL',
            'Type' => 'text',
            'Size' => '60',
            'Default' => 'https://my.globalhostia.com/submitticket.php',
        ],
    ];
}

/**
 * Invoice page output: creates (or reuses) the YouPI order server-side and renders the pay button.
 *
 * @param array<string,mixed> $params
 * @return string
 */
function youpi_link($params)
{
    $cfg = Config::fromParams($params);
    $systemUrl = (string) ($params['systemurl'] ?? '/');
    $invoiceId = (int) ($params['invoiceid'] ?? 0);
    $unavailable = function (string $why, string $title = 'UPI payment is unavailable right now') use ($cfg, $systemUrl) {
        return View::notice($cfg, $systemUrl, $title, $why, 'warn');
    };

    if ($cfg->testMode && empty($_SESSION['adminid'])) {
        return $unavailable('Please choose another payment method for now.');
    }
    $problems = $cfg->problems();
    if ($problems) {
        logActivity('[YouPI] gateway not configured: ' . implode('; ', $problems));
        return $unavailable('Please choose another payment method or contact billing support.');
    }
    if ($invoiceId < 1) {
        return $unavailable('This invoice could not be read.');
    }

    $currency = strtoupper((string) ($params['currency'] ?? ''));
    if ($currency !== 'INR') {
        return $unavailable('UPI payments can only be made in Indian rupees (INR). This invoice is in ' . $currency . '. Please choose another payment method.', 'UPI is for INR invoices');
    }

    try {
        Store::ensureSchema();
        if ($cfg->acceptOnlyInr) {
            $invCur = Store::invoiceCurrency($invoiceId);
            if ($invCur !== null && $invCur['code'] !== 'INR') {
                return $unavailable('UPI accepts INR invoices only. Your account is billed in ' . $invCur['code'] . '. Please choose another payment method or ask billing support to switch your account to INR.', 'UPI is for INR invoices');
            }
        }

        $amountPaise = Money::toPaise((string) ($params['amount'] ?? ''));
        if ($amountPaise === null || $amountPaise <= 0) {
            return $unavailable('The amount due could not be read.');
        }
        if ($amountPaise < $cfg->minPaise) {
            return $unavailable('UPI is available for payments of ₹' . Money::display($cfg->minPaise) . ' or more.', 'Amount too small for UPI');
        }
        if ($cfg->maxPaise > 0 && $amountPaise > $cfg->maxPaise) {
            return $unavailable('UPI is available for payments up to ₹' . Money::display($cfg->maxPaise) . '. Please choose another payment method.', 'Amount too large for UPI');
        }

        $row = Store::latestOrderForInvoice($invoiceId);
        if ($row) {
            if (in_array($row->status, [Store::S_PAID, Store::S_APPLYING], true)) {
                return View::notice($cfg, $systemUrl, 'Payment received', 'Your UPI payment was received and is being applied to this invoice. Refresh in a minute.', 'ok');
            }
            if ($row->status === Store::S_REVIEW) {
                return View::notice($cfg, $systemUrl, 'Payment under review', 'We received a UPI payment for this invoice and our billing team is checking it. Please do not pay again.', 'info');
            }
            if ($row->status === Store::S_OBSERVED) {
                return View::notice($cfg, $systemUrl, 'Payment being confirmed', 'Your bank has reported the payment. We mark the invoice paid once it matches our bank statement. Please do not pay again.', 'info');
            }
        }

        $client = $cfg->client();
        $checkoutUrl = null;

        // Reuse the current order when the amount is unchanged and the session is still usable.
        if ($row && (int) $row->amount_paise === $amountPaise && in_array($row->status, [Store::S_CREATED, Store::S_PENDING, Store::S_FAILED, Store::S_EXPIRED, Store::S_CANCELLED], true)) {
            if ($row->status === Store::S_PENDING && $row->payment_id && $row->checkout_url) {
                $st = $client->getPayment((string) $row->payment_id, 0);
                $status = strtoupper((string) ($st['body']['status'] ?? ''));
                if (in_array($status, ['OBSERVED_SUCCESS', 'RECONCILED', 'MANUAL_REVIEW'], true)) {
                    return View::notice($cfg, $systemUrl, 'Payment being confirmed', 'Our payment system has seen your UPI payment. This page updates once it is applied. Please do not pay again.', 'info');
                }
                if (in_array($status, ['INITIATED', 'QUEUED', 'ACTIVE', 'PROCESSING'], true) || $st['status'] !== 200) {
                    // Live session (or YouPI unreachable for status): keep the same checkout link.
                    $checkoutUrl = (string) $row->checkout_url;
                }
            }
        } else {
            $row = null;
        }

        if ($checkoutUrl === null) {
            $created = youpi_create_session($params, $cfg, $client, $invoiceId, $amountPaise, $row);
            if (isset($created['error'])) {
                return $unavailable($created['error']);
            }
            $checkoutUrl = $created['checkoutUrl'];
        }

        return View::payButton($cfg, $systemUrl, $checkoutUrl, $amountPaise, $invoiceId);
    } catch (\Throwable $e) {
        logActivity('[YouPI] invoice #' . $invoiceId . ' link error: ' . substr($e->getMessage(), 0, 300));
        return $unavailable('Please try again in a minute or choose another payment method.');
    }
}

/**
 * Creates the YouPI payment session for an order row (allocating a new row/suffix when needed).
 *
 * @param array<string,mixed> $params
 * @param object|null $row reusable row with the same amount, or null to allocate a new one
 * @return array{checkoutUrl:string}|array{error:string}
 */
function youpi_create_session(array $params, Config $cfg, \GlobalHostia\YouPI\ApiClient $client, int $invoiceId, int $amountPaise, $row)
{
    $friendly = 'Please try again in a minute or choose another payment method.';
    if ($row === null) {
        $row = Store::createOrder($invoiceId, $amountPaise);
        Store::supersedeOpenOrders($invoiceId, (int) $row->id);
    }

    $client_ = $params['clientdetails'] ?? [];
    $customer = array_filter([
        'name' => trim(((string) ($client_['firstname'] ?? '')) . ' ' . ((string) ($client_['lastname'] ?? ''))),
        'email' => filter_var((string) ($client_['email'] ?? ''), FILTER_VALIDATE_EMAIL) ?: '',
        'phoneNumber' => Util::indianMobile($client_['phonenumber'] ?? ''),
    ], 'strlen');

    $returnUrl = (string) ($params['returnurl'] ?? '');
    $body = [
        'orderId' => (string) $row->order_id,
        'amount' => Money::format($amountPaise),
        'currency' => 'INR',
        'method' => 'UPI',
        'description' => substr(((string) ($params['companyname'] ?? $cfg->brandName)) . ' invoice #' . $invoiceId, 0, 120),
        'metadata' => ['source' => 'whmcs', 'whmcsInvoiceId' => $invoiceId],
    ];
    if ($customer) {
        $body['customer'] = $customer;
    }
    if (Util::isHttpsUrl($returnUrl)) {
        $body['returnUrl'] = $returnUrl;
    }

    for ($attempt = 0; $attempt < 3; $attempt++) {
        $res = $client->createPayment($body, 'whmcs-' . $body['orderId'] . '-' . $amountPaise, 1);
        $b = is_array($res['body']) ? $res['body'] : [];
        $code = (string) ($b['code'] ?? $b['error'] ?? '');

        if ($res['status'] === 200 || $res['status'] === 201) {
            $paymentId = (string) ($b['paymentId'] ?? '');
            $url = (string) ($b['checkoutUrl'] ?? '');
            if (!Util::validPaymentId($paymentId) || !youpi_checkout_url_ok($url, $cfg)) {
                logTransaction($params['name'] ?? 'youpi', ['_outcome' => 'create: unexpected response', 'orderId' => $body['orderId'], 'checkoutOrigin' => Util::origin($url)], 'Create Error');
                return ['error' => $friendly];
            }
            if (($b['orderId'] ?? $body['orderId']) !== $body['orderId']) {
                return ['error' => $friendly];
            }
            $status = strtoupper((string) ($b['status'] ?? ''));
            if (in_array($status, ['OBSERVED_SUCCESS', 'RECONCILED', 'MANUAL_REVIEW', 'SUCCESS'], true)) {
                Store::updateOrder((int) $row->id, ['payment_id' => $paymentId, 'checkout_url' => $url]);
                return ['error' => 'A payment for this invoice is already being confirmed. Please refresh in a minute and do not pay again.'];
            }
            Store::updateOrder((int) $row->id, ['payment_id' => $paymentId, 'checkout_url' => $url, 'status' => Store::S_PENDING]);
            return ['checkoutUrl' => $url];
        }

        if ($res['status'] === 409 && $code === 'ORDER_AMOUNT_MISMATCH') {
            // This order id already exists in YouPI with another amount (invoice changed): new suffix.
            Store::updateOrder((int) $row->id, ['status' => Store::S_SUPERSEDED]);
            $row = Store::createOrder($invoiceId, $amountPaise);
            $body['orderId'] = (string) $row->order_id;
            continue;
        }

        if ($res['status'] === 409 && (($b['error'] ?? '') === 'DUPLICATE_SESSION_DETECTED' || $code === 'DEVICE_SESSION_MISMATCH')) {
            // The live session was bound to the customer's device by the checkout; reuse it.
            $sid = (string) ($b['session_id'] ?? '');
            if (Util::validPaymentId($sid) && $row->payment_id === $sid && youpi_checkout_url_ok((string) $row->checkout_url, $cfg)) {
                return ['checkoutUrl' => (string) $row->checkout_url];
            }
            if (Util::validPaymentId($sid) && $cfg->portalOrigin() !== '') {
                $url = rtrim($cfg->checkoutPortalUrl !== '' ? $cfg->checkoutPortalUrl : $cfg->apiBaseUrl, '/') . '/checkout/' . rawurlencode($sid);
                Store::updateOrder((int) $row->id, ['payment_id' => $sid, 'checkout_url' => $url, 'status' => Store::S_PENDING]);
                return ['checkoutUrl' => $url];
            }
            return ['error' => 'A payment for this invoice is already open on another device. Finish it there, or wait five minutes and try again.'];
        }

        if ($res['status'] === 400 && isset($body['returnUrl']) && stripos((string) ($b['error'] ?? ''), 'returnUrl') !== false) {
            // YOUPI_ALLOWED_RETURN_ORIGINS does not list the WHMCS origin; continue without a return link.
            logActivity('[YouPI] returnUrl rejected by YouPI; add https://my.globalhostia.com to YOUPI_ALLOWED_RETURN_ORIGINS');
            unset($body['returnUrl']);
            continue;
        }

        logTransaction($params['name'] ?? 'youpi', [
            '_outcome' => 'create payment failed',
            'orderId' => $body['orderId'],
            'httpStatus' => $res['status'],
            'code' => substr($code, 0, 64),
            'error' => substr((string) ($b['error'] ?? $res['error'] ?? ''), 0, 200),
            'attempts' => $res['attempts'],
        ], 'Create Error');

        if ($res['status'] === 503) {
            return ['error' => 'Our UPI service is briefly offline. Please try again in a few minutes or choose another payment method.'];
        }
        if ($res['status'] === 403) {
            return ['error' => 'UPI payment is not available for this account. Please choose another payment method or contact billing support.'];
        }
        return ['error' => $friendly];
    }
    return ['error' => $friendly];
}

/** Checkout links must be https and on the configured portal origin (no open redirects). */
function youpi_checkout_url_ok(string $url, Config $cfg): bool
{
    return Util::isHttpsUrl($url) && Util::origin($url) === $cfg->portalOrigin()
        && preg_match('#^/checkout/[A-Za-z0-9-]{8,64}$#', (string) parse_url($url, PHP_URL_PATH)) === 1;
}
