<?php
/**
 * Safety net for missed webhooks, run from the AfterCronJob hook.
 *
 * Polls GET /api/v1/payments/{paymentId} (owner view, X-Merchant-Key) for open orders and feeds
 * the result through the same Processor checks as the webhook.
 *
 * Limitation (verified in YouPI source, payments.routes.js): the GET response does NOT include
 * the UTR. Without a UTR there is no unique WHMCS transaction id, so a paid status found by
 * polling is held for manual review (admin email) instead of being credited. If a future YouPI
 * version adds "utr" to that response, it is used automatically.
 */

namespace GlobalHostia\YouPI;

final class Reconciler
{
    const STATE_LAST_RUN = 'reconcile_last_run';
    const MIN_INTERVAL_SECONDS = 600;

    /** @return array<string,int> counters for the activity log */
    public static function run(bool $force = false): array
    {
        $stats = ['polled' => 0, 'applied' => 0, 'held' => 0, 'closed' => 0, 'errors' => 0, 'stale' => 0];

        $gw = getGatewayVariables(Processor::MODULE);
        if (empty($gw['type'])) {
            return $stats; // gateway not activated
        }
        $cfg = Config::fromParams($gw);
        if ($cfg->problems()) {
            return $stats;
        }
        Store::ensureSchema();

        $last = (int) (Store::getState(self::STATE_LAST_RUN) ?? 0);
        if (!$force && time() - $last < self::MIN_INTERVAL_SECONDS) {
            return $stats;
        }
        Store::setState(self::STATE_LAST_RUN, (string) time());

        // 1. Rows a crashed worker left in APPLYING.
        foreach (Store::staleClaims(600) as $row) {
            $stats['stale']++;
            $tx = $row->utr ? Store::transaction((string) $row->utr) : null;
            if ($tx && (int) $tx->invoiceid === (int) $row->invoice_id) {
                Store::updateOrder((int) $row->id, ['status' => Store::S_PAID, 'claimed_at' => null]);
            } else {
                Store::updateOrder((int) $row->id, ['status' => Store::S_REVIEW, 'claimed_at' => null, 'review_reason' => 'worker stopped while applying payment']);
                Notify::admin('YouPI: order ' . $row->order_id . ' needs a check', 'A payment for invoice #' . (int) $row->invoice_id . ' was being applied when the process stopped. Check the invoice and the bank statement.');
            }
        }

        // 2. Poll open orders.
        $client = $cfg->client();
        foreach (Store::rowsToReconcile(40, 72) as $row) {
            $invoice = Store::invoice((int) $row->invoice_id);
            if (!$invoice) {
                continue;
            }
            $stats['polled']++;
            Store::updateOrder((int) $row->id, ['last_polled_at' => Store::now()]);
            $res = $client->getPayment((string) $row->payment_id, 2);
            if ($res['status'] !== 200 || !is_array($res['body'])) {
                $stats['errors']++;
                logTransaction($gw['name'], ['_source' => 'reconcile', 'orderId' => $row->order_id, 'httpStatus' => $res['status'], 'error' => (string) $res['error']], 'Reconcile Error');
                continue;
            }
            $b = $res['body'];
            if ((string) ($b['orderId'] ?? '') !== (string) $row->order_id) {
                $stats['errors']++;
                logTransaction($gw['name'], ['_source' => 'reconcile', 'orderId' => $row->order_id, 'error' => 'orderId mismatch in YouPI response'], 'Reconcile Error');
                continue;
            }
            $status = strtoupper((string) ($b['status'] ?? ''));
            $paidLike = $status === 'RECONCILED'
                || ($status === 'OBSERVED_SUCCESS' && $cfg->confirmOn === Config::CONFIRM_OBSERVED)
                || $status === 'MANUAL_REVIEW';

            if ($paidLike || in_array($status, ['FAILED', 'EXPIRED', 'CANCELLED', 'OBSERVED_SUCCESS'], true)) {
                $payload = [
                    'event' => $status,
                    'orderId' => (string) $row->order_id,
                    'paymentId' => (string) ($b['paymentId'] ?? $row->payment_id),
                    'amount' => (string) ($b['amount'] ?? ''),
                    'amountPaise' => (string) ($b['amountPaise'] ?? ''),
                    'currency' => (string) ($b['currency'] ?? ''),
                    'method' => (string) ($b['method'] ?? ''),
                    'utr' => (string) ($b['utr'] ?? ''),
                    'settlementState' => (string) ($b['settlementState'] ?? ''),
                ];
                if ($paidLike && !Util::validUtr($payload['utr'])) {
                    // No UTR from the API: never invent a transaction id. Flag once.
                    if ($row->flagged_at === null) {
                        $stats['held']++;
                        Store::updateOrder((int) $row->id, ['status' => Store::S_REVIEW, 'flagged_at' => Store::now(), 'review_reason' => 'webhook missed; YouPI reports ' . $status . ' without UTR']);
                        Notify::admin(
                            'YouPI: invoice #' . (int) $row->invoice_id . ' may be paid (webhook missed)',
                            "Polling YouPI shows {$status} for order {$row->order_id} (payment {$row->payment_id}), INR " . $payload['amount'] . ", but no webhook was processed.\n"
                            . "The YouPI status API does not return the UTR, so no payment was added. Find the UTR in YouPI Merchant Admin or the bank statement, "
                            . "then add the payment to the invoice with the UTR as transaction id. Also check why the webhook did not arrive (URL, secret, clock skew)."
                        );
                        logTransaction($gw['name'], Util::loggablePayload($payload) + ['_source' => 'reconcile', '_outcome' => 'Held: paid status without UTR'], 'Held for Review');
                    }
                    continue;
                }
                $out = Processor::handle($gw, $cfg, $payload, 'reconcile');
                if (strpos($out['outcome'], 'Success') === 0) {
                    $stats['applied']++;
                } elseif (strpos($out['outcome'], 'Held') === 0) {
                    $stats['held']++;
                } elseif (strpos($out['outcome'], 'Recorded') === 0) {
                    $stats['closed']++;
                }
            }
        }

        if (mt_rand(1, 20) === 1) {
            Store::pruneDeliveries(90);
        }
        if (array_sum($stats) > 0 && function_exists('logActivity')) {
            logActivity('[YouPI] reconcile: ' . http_build_query($stats, '', ', '));
        }
        return $stats;
    }
}
