<?php
/**
 * Applies YouPI payment outcomes to WHMCS invoices. Shared by the webhook callback and the
 * reconciliation hook so both paths run the exact same checks.
 *
 * Requires WHMCS context: checkCbInvoiceID, checkCbTransID, addInvoicePayment, logTransaction,
 * logActivity, localAPI (includes/gatewayfunctions.php + includes/invoicefunctions.php).
 */

namespace GlobalHostia\YouPI;

final class Processor
{
    const MODULE = 'youpi';

    /** Events that mean money may have reached the receiving account. */
    const MONEY_EVENTS = ['OBSERVED_SUCCESS', 'RECONCILED', 'MANUAL_REVIEW', 'SUCCESS'];

    /**
     * @param array<string,mixed> $gw      getGatewayVariables('youpi')
     * @param array<string,mixed> $payload verified webhook payload (or reconciler-built equivalent)
     * @param string $source               'webhook' | 'reconcile'
     * @return array{http:int, outcome:string}
     */
    public static function handle(array $gw, Config $cfg, array $payload, string $source): array
    {
        $event = strtoupper(trim((string) ($payload['event'] ?? '')));
        $orderId = (string) ($payload['orderId'] ?? '');
        $parsed = OrderId::parse($orderId);
        if ($parsed === null) {
            return self::log($gw, 400, 'Rejected: orderId is not a WHMCS-issued YouPI order id', $payload, $source);
        }

        $row = Store::findOrder($orderId);
        if (!$row) {
            if (in_array($event, self::MONEY_EVENTS, true)) {
                Notify::admin(
                    'YouPI: payment event for an unknown order ' . $orderId,
                    "YouPI sent {$event} for order {$orderId} (invoice #{$parsed['invoiceId']}), but this WHMCS has no record of that order id.\n"
                    . 'UTR: ' . (string) ($payload['utr'] ?? '(none)') . ', amount: INR ' . (string) ($payload['amount'] ?? '?') . "\n"
                    . "No payment was added. Check the YouPI admin and the bank statement."
                );
            }
            return self::log($gw, 200, 'Ignored: unknown order id', $payload, $source);
        }
        if ((int) $row->invoice_id !== $parsed['invoiceId']) {
            return self::log($gw, 400, 'Rejected: order id does not belong to the recorded invoice', $payload, $source);
        }

        switch ($event) {
            case 'RECONCILED':
                return self::apply($gw, $cfg, $row, $payload, $source, $event);

            case 'OBSERVED_SUCCESS':
                if ($cfg->confirmOn === Config::CONFIRM_OBSERVED) {
                    return self::apply($gw, $cfg, $row, $payload, $source, $event);
                }
                if (!in_array($row->status, [Store::S_PAID, Store::S_APPLYING, Store::S_REVIEW], true)) {
                    Store::updateOrder((int) $row->id, ['status' => Store::S_OBSERVED, 'utr' => self::utrOrNull($payload)]);
                }
                return self::log($gw, 200, 'Pending: bank alert observed; waiting for RECONCILED (statement match) before marking paid', $payload, $source);

            case 'MANUAL_REVIEW':
                return self::hold($gw, $row, $payload, $source, 'YouPI flagged this payment for manual review', true);

            case 'SUCCESS':
                // In YouPI, SUCCESS is the COD / counter outcome, not a bank-observed UPI payment.
                return self::hold($gw, $row, $payload, $source, 'YouPI sent SUCCESS (COD/counter outcome), which this module never treats as a UPI payment', false);

            case 'FAILED':
            case 'EXPIRED':
            case 'CANCELLED':
                if (in_array($row->status, [Store::S_CREATED, Store::S_PENDING], true)) {
                    Store::updateOrder((int) $row->id, ['status' => $event]);
                }
                return self::log($gw, 200, 'Recorded: YouPI session ' . strtolower($event), $payload, $source);

            default:
                return self::log($gw, 200, 'Ignored: unsupported event "' . substr($event, 0, 32) . '"', $payload, $source);
        }
    }

    /**
     * All verification before money is credited. Anything ambiguous is held for a human.
     * @param object $row
     * @param array<string,mixed> $p
     * @return array{http:int, outcome:string}
     */
    private static function apply(array $gw, Config $cfg, $row, array $p, string $source, string $event): array
    {
        $invoiceId = (int) $row->invoice_id;

        if (strtoupper((string) ($p['method'] ?? 'UPI')) !== 'UPI') {
            return self::hold($gw, $row, $p, $source, 'payment method is not UPI', false);
        }
        if (strtoupper((string) ($p['currency'] ?? 'INR')) !== 'INR') {
            return self::hold($gw, $row, $p, $source, 'payment currency is not INR', false);
        }
        $amountPaise = Money::paiseField($p['amountPaise'] ?? null);
        if ($amountPaise === null) {
            return self::log($gw, 400, 'Rejected: amountPaise missing or malformed', $p, $source);
        }
        if (isset($p['amount']) && Money::toPaise((string) $p['amount']) !== $amountPaise) {
            return self::log($gw, 400, 'Rejected: amount and amountPaise disagree', $p, $source);
        }

        $utr = trim((string) ($p['utr'] ?? ''));
        if (!Util::validUtr($utr)) {
            return self::hold($gw, $row, $p, $source, 'no valid UTR (bank reference) in the YouPI event', true);
        }

        // Idempotency: the UTR is the WHMCS transaction id. Checked here so a duplicate is a calm 200,
        // because checkCbTransID() would terminate the script.
        $existing = Store::transaction($utr);
        if ($existing) {
            if ((int) $existing->invoiceid === $invoiceId) {
                if ($row->status !== Store::S_PAID) {
                    Store::updateOrder((int) $row->id, ['status' => Store::S_PAID, 'utr' => $utr]);
                }
                return self::log($gw, 200, 'Duplicate: UTR already applied to this invoice', $p, $source);
            }
            return self::hold($gw, $row, $p, $source, 'UTR ' . $utr . ' is already recorded against invoice #' . (int) $existing->invoiceid, false);
        }

        if ($row->status === Store::S_PAID) {
            return self::hold($gw, $row, $p, $source, 'order was already paid with a different UTR (' . (string) $row->utr . '); possible double payment', false);
        }

        $invoice = Store::invoice($invoiceId);
        if (!$invoice) {
            return self::hold($gw, $row, $p, $source, 'invoice #' . $invoiceId . ' no longer exists', false);
        }
        if ((string) $invoice->status !== 'Unpaid') {
            return self::hold($gw, $row, $p, $source, 'invoice status is ' . (string) $invoice->status . ', not Unpaid; refund or credit decision needed', false);
        }

        if ($amountPaise !== (int) $row->amount_paise) {
            return self::hold($gw, $row, $p, $source, 'paid INR ' . Money::format($amountPaise) . ' but the order was for INR ' . Money::format((int) $row->amount_paise), true);
        }

        $expected = self::expectedInr($invoiceId, $cfg);
        if (isset($expected['error'])) {
            return self::hold($gw, $row, $p, $source, $expected['error'], true);
        }
        $tolerance = $expected['converted'] ? 1 : 0;
        if (abs($expected['inrPaise'] - $amountPaise) > $tolerance) {
            return self::hold($gw, $row, $p, $source, 'paid INR ' . Money::format($amountPaise) . ' but the invoice balance is INR ' . Money::format($expected['inrPaise']), true);
        }

        if ($cfg->reviewAbovePaise > 0 && $amountPaise > $cfg->reviewAbovePaise) {
            return self::hold($gw, $row, $p, $source, 'amount is above the manual-review threshold of INR ' . Money::format($cfg->reviewAbovePaise), true);
        }

        $previousStatus = (string) $row->status;
        if (!Store::claimForApply((int) $row->id)) {
            return self::log($gw, 200, 'In progress: another worker is applying this order', $p, $source);
        }
        try {
            checkCbInvoiceID($invoiceId, $gw['name']);
            checkCbTransID($utr);
            addInvoicePayment($invoiceId, $utr, $expected['whmcsAmount'], 0, $gw['paymentmethod'] ?? self::MODULE);
        } catch (\Throwable $e) {
            Store::releaseClaim((int) $row->id, $previousStatus === Store::S_APPLYING ? Store::S_PENDING : $previousStatus);
            throw $e;
        }
        $fields = ['status' => Store::S_PAID, 'utr' => $utr, 'claimed_at' => null, 'review_reason' => null];
        if (isset($p['paymentId']) && Util::validPaymentId($p['paymentId'])) {
            $fields['payment_id'] = $p['paymentId'];
        }
        Store::updateOrder((int) $row->id, $fields);

        return self::log($gw, 200, 'Success: payment added (' . $event . ', UTR ' . $utr . ')', $p, $source, 'Success');
    }

    /**
     * INR amount the customer should have paid for the current invoice balance.
     * @return array{inrPaise:int, converted:bool, whmcsAmount:string}|array{error:string}
     */
    public static function expectedInr(int $invoiceId, Config $cfg): array
    {
        $cur = Store::invoiceCurrency($invoiceId);
        $balance = Store::invoiceBalancePaise($invoiceId);
        if ($cur === null || $balance === null) {
            return ['error' => 'could not read invoice #' . $invoiceId . ' currency or balance'];
        }
        if ($balance <= 0) {
            return ['error' => 'invoice #' . $invoiceId . ' has no balance due'];
        }
        if ($cur['code'] === 'INR') {
            return ['inrPaise' => $balance, 'converted' => false, 'whmcsAmount' => Money::format($balance)];
        }
        if ($cfg->acceptOnlyInr) {
            return ['error' => 'invoice currency is ' . $cur['code'] . ' and "Accept only INR invoices" is enabled'];
        }
        $inrId = Store::inrCurrencyId();
        if ($inrId === null || !function_exists('convertCurrency')) {
            return ['error' => 'cannot convert ' . $cur['code'] . ' to INR (INR currency missing in WHMCS)'];
        }
        $inr = convertCurrency(Money::format($balance), $cur['id'], $inrId);
        return ['inrPaise' => Money::fromDecimal($inr), 'converted' => true, 'whmcsAmount' => Money::format($balance)];
    }

    /**
     * Do not add the payment; record why, tell staff once per order/UTR, optionally tell the client.
     * @param object $row
     * @param array<string,mixed> $p
     * @return array{http:int, outcome:string}
     */
    private static function hold(array $gw, $row, array $p, string $source, string $reason, bool $clientNote): array
    {
        $utr = self::utrOrNull($p);
        $amount = Money::paiseField($p['amountPaise'] ?? null);
        $alreadyFlagged = $row->status === Store::S_REVIEW && (string) $row->utr === (string) $utr && (string) $row->review_reason === $reason;

        if ($row->status !== Store::S_PAID) {
            Store::updateOrder((int) $row->id, [
                'status' => Store::S_REVIEW,
                'utr' => $utr,
                'review_reason' => substr($reason, 0, 255),
                'flagged_at' => Store::now(),
            ]);
        }

        if (!$alreadyFlagged) {
            $invoiceId = (int) $row->invoice_id;
            $amountText = $amount !== null ? 'INR ' . Money::format($amount) : 'unknown amount';
            Notify::admin(
                'YouPI: invoice #' . $invoiceId . ' payment held for review',
                "A YouPI UPI payment was NOT added automatically.\n\n"
                . "Invoice: #{$invoiceId}\nOrder: {$row->order_id}\nEvent: " . (string) ($p['event'] ?? '?') . "\n"
                . "Amount: {$amountText}\nUTR: " . ($utr ?? '(none)') . "\nYouPI payment id: " . (string) ($p['paymentId'] ?? $row->payment_id ?? '?') . "\n"
                . "Reason: {$reason}\nSource: {$source}\n\n"
                . "Check the receiving bank account statement for this UTR and amount. If the money is there and the amount is right, "
                . "add the payment in WHMCS (Invoice > Add Payment, gateway YouPI UPI, transaction id = the UTR). Otherwise refund it from the bank."
            );
            if ($clientNote && $utr !== null) {
                Notify::invoiceNote($invoiceId, 'UPI payment (ref ending ' . substr($utr, -4) . ') received and under review by our billing team. Please do not pay again; we will update this invoice shortly.');
            }
        }
        return self::log($gw, 200, 'Held for manual review: ' . $reason, $p, $source, 'Held for Review');
    }

    /**
     * @param array<string,mixed> $p
     * @return array{http:int, outcome:string}
     */
    private static function log(array $gw, int $http, string $outcome, array $p, string $source, ?string $status = null): array
    {
        $data = Util::loggablePayload($p);
        $data['_source'] = $source;
        $data['_outcome'] = $outcome;
        if (function_exists('logTransaction')) {
            logTransaction($gw['name'] ?? self::MODULE, $data, $status ?? ($http >= 400 ? 'Rejected' : 'Info'));
        }
        return ['http' => $http, 'outcome' => $outcome];
    }

    /** @param array<string,mixed> $p */
    private static function utrOrNull(array $p): ?string
    {
        $utr = trim((string) ($p['utr'] ?? ''));
        return Util::validUtr($utr) ? $utr : null;
    }
}

final class Notify
{
    public static function admin(string $subject, string $message): void
    {
        if (function_exists('logActivity')) {
            logActivity('[YouPI] ' . $subject);
        }
        if (!function_exists('localAPI')) {
            return;
        }
        try {
            localAPI('SendAdminEmail', [
                'customsubject' => $subject,
                'custommessage' => nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8')),
                'type' => 'system',
            ]);
        } catch (\Throwable $e) {
            if (function_exists('logActivity')) {
                logActivity('[YouPI] admin email failed: ' . substr($e->getMessage(), 0, 200));
            }
        }
    }

    /** Appends a client-visible note to the invoice (WHMCS shows invoice notes on the invoice). */
    public static function invoiceNote(int $invoiceId, string $note): void
    {
        if (!function_exists('localAPI')) {
            return;
        }
        try {
            $inv = Store::invoice($invoiceId);
            $current = $inv ? trim((string) $inv->notes) : '';
            if ($current !== '' && strpos($current, $note) !== false) {
                return;
            }
            localAPI('UpdateInvoice', ['invoiceid' => $invoiceId, 'notes' => trim($current . "\n" . $note)]);
        } catch (\Throwable $e) {
            if (function_exists('logActivity')) {
                logActivity('[YouPI] could not add invoice note to #' . $invoiceId);
            }
        }
    }
}
