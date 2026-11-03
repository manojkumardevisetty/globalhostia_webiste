<?php
/**
 * Persistence for the YouPI gateway. Capsule (Laravel query builder) only; no SQL strings.
 *
 * Tables (created on first use):
 *   mod_youpi_orders      one row per YouPI orderId issued for an invoice
 *   mod_youpi_deliveries  processed X-Gateway-Delivery-Id values (webhook replay/dup guard)
 *   mod_youpi_state       small key/value store (reconciler throttle)
 */

namespace GlobalHostia\YouPI;

use WHMCS\Database\Capsule;

final class Store
{
    const T_ORDERS = 'mod_youpi_orders';
    const T_DELIVERIES = 'mod_youpi_deliveries';
    const T_STATE = 'mod_youpi_state';

    // Order row statuses.
    const S_CREATED = 'CREATED';       // row exists, YouPI session not created yet
    const S_PENDING = 'PENDING';       // YouPI session exists, awaiting payment
    const S_OBSERVED = 'OBSERVED';     // bank alert seen, waiting for RECONCILED (reconciled mode)
    const S_APPLYING = 'APPLYING';     // claimed by a worker that is adding the WHMCS payment
    const S_PAID = 'PAID';
    const S_REVIEW = 'REVIEW';         // money may have arrived; a human must decide
    const S_SUPERSEDED = 'SUPERSEDED'; // invoice amount changed; a newer order replaced this one
    const S_FAILED = 'FAILED';
    const S_EXPIRED = 'EXPIRED';
    const S_CANCELLED = 'CANCELLED';

    /** @var bool */
    private static $ready = false;

    public static function ensureSchema(): void
    {
        if (self::$ready) {
            return;
        }
        $schema = Capsule::schema();
        self::createIfMissing(self::T_ORDERS, function ($t) {
            $t->increments('id');
            $t->unsignedInteger('invoice_id')->index();
            $t->string('order_id', 40)->unique();
            $t->unsignedBigInteger('amount_paise');
            $t->string('currency', 3)->default('INR');
            $t->string('payment_id', 64)->nullable()->index();
            $t->string('checkout_url', 512)->nullable();
            $t->string('status', 16)->default(self::S_CREATED)->index();
            $t->string('utr', 40)->nullable()->index();
            $t->string('review_reason', 255)->nullable();
            $t->dateTime('claimed_at')->nullable();
            $t->dateTime('last_polled_at')->nullable();
            $t->dateTime('flagged_at')->nullable();
            $t->dateTime('created_at')->nullable();
            $t->dateTime('updated_at')->nullable();
        });
        self::createIfMissing(self::T_DELIVERIES, function ($t) {
            $t->string('delivery_id', 64)->primary();
            $t->string('order_id', 40)->nullable()->index();
            $t->string('event', 32)->nullable();
            $t->string('outcome', 191)->nullable();
            $t->dateTime('received_at')->nullable()->index();
        });
        self::createIfMissing(self::T_STATE, function ($t) {
            $t->string('k', 64)->primary();
            $t->string('v', 255)->nullable();
            $t->dateTime('updated_at')->nullable();
        });
        unset($schema);
        self::$ready = true;
    }

    private static function createIfMissing(string $table, callable $definition): void
    {
        $schema = Capsule::schema();
        if ($schema->hasTable($table)) {
            return;
        }
        try {
            $schema->create($table, $definition);
        } catch (\Throwable $e) {
            // Another request may have created it concurrently.
            if (!$schema->hasTable($table)) {
                throw $e;
            }
        }
    }

    public static function now(): string
    {
        return date('Y-m-d H:i:s');
    }

    // ---------------------------------------------------------------- orders

    /** @return object|null */
    public static function latestOrderForInvoice(int $invoiceId)
    {
        return Capsule::table(self::T_ORDERS)->where('invoice_id', $invoiceId)->orderBy('id', 'desc')->first();
    }

    /** @return object|null */
    public static function findOrder(string $orderId)
    {
        return Capsule::table(self::T_ORDERS)->where('order_id', $orderId)->first();
    }

    /** @return object|null */
    public static function findOrderById(int $id)
    {
        return Capsule::table(self::T_ORDERS)->where('id', $id)->first();
    }

    /** Inserts a new order row with a fresh nonce; returns the row. @return object */
    public static function createOrder(int $invoiceId, int $amountPaise)
    {
        for ($i = 0; $i < 5; $i++) {
            $orderId = OrderId::build($invoiceId, OrderId::newNonce());
            try {
                $id = Capsule::table(self::T_ORDERS)->insertGetId([
                    'invoice_id' => $invoiceId,
                    'order_id' => $orderId,
                    'amount_paise' => $amountPaise,
                    'currency' => 'INR',
                    'status' => self::S_CREATED,
                    'created_at' => self::now(),
                    'updated_at' => self::now(),
                ]);
                return self::findOrderById((int) $id);
            } catch (\Throwable $e) {
                if (self::findOrder($orderId) === null) {
                    throw $e;
                }
                // nonce collision: try again
            }
        }
        throw new \RuntimeException('could not allocate a unique YouPI order id');
    }

    /** @param array<string,mixed> $fields */
    public static function updateOrder(int $id, array $fields): void
    {
        $fields['updated_at'] = self::now();
        Capsule::table(self::T_ORDERS)->where('id', $id)->update($fields);
    }

    /** Marks older still-open rows for the invoice as superseded by a new amount. */
    public static function supersedeOpenOrders(int $invoiceId, int $exceptId): void
    {
        Capsule::table(self::T_ORDERS)
            ->where('invoice_id', $invoiceId)
            ->where('id', '<>', $exceptId)
            ->whereIn('status', [self::S_CREATED, self::S_PENDING])
            ->update(['status' => self::S_SUPERSEDED, 'updated_at' => self::now()]);
    }

    /**
     * Atomic claim: only one worker (webhook or reconciler) may add the WHMCS payment for a row.
     * Returns true when this caller now owns the row.
     */
    public static function claimForApply(int $id): bool
    {
        $n = Capsule::table(self::T_ORDERS)
            ->where('id', $id)
            ->whereNotIn('status', [self::S_PAID, self::S_APPLYING])
            ->update(['status' => self::S_APPLYING, 'claimed_at' => self::now(), 'updated_at' => self::now()]);
        return $n === 1;
    }

    public static function releaseClaim(int $id, string $backTo): void
    {
        Capsule::table(self::T_ORDERS)->where('id', $id)->where('status', self::S_APPLYING)
            ->update(['status' => $backTo, 'claimed_at' => null, 'updated_at' => self::now()]);
    }

    /** Rows needing a reconciliation poll. @return object[] */
    public static function rowsToReconcile(int $limit, int $maxAgeHours): array
    {
        $since = date('Y-m-d H:i:s', time() - $maxAgeHours * 3600);
        return Capsule::table(self::T_ORDERS)
            ->whereIn('status', [self::S_PENDING, self::S_OBSERVED])
            ->whereNotNull('payment_id')
            ->where('created_at', '>=', $since)
            ->orderBy('last_polled_at', 'asc')
            ->orderBy('id', 'asc')
            ->limit($limit)
            ->get()
            ->all();
    }

    /** Rows stuck in APPLYING (worker died mid-way). @return object[] */
    public static function staleClaims(int $olderThanSeconds): array
    {
        return Capsule::table(self::T_ORDERS)
            ->where('status', self::S_APPLYING)
            ->where('claimed_at', '<', date('Y-m-d H:i:s', time() - $olderThanSeconds))
            ->limit(50)->get()->all();
    }

    // ------------------------------------------------------------ deliveries

    /** Inserts the delivery id; false when it was already processed (or is being processed). */
    public static function claimDelivery(string $deliveryId, string $orderId, string $event): bool
    {
        try {
            Capsule::table(self::T_DELIVERIES)->insert([
                'delivery_id' => $deliveryId,
                'order_id' => substr($orderId, 0, 40),
                'event' => substr($event, 0, 32),
                'outcome' => 'processing',
                'received_at' => self::now(),
            ]);
            return true;
        } catch (\Throwable $e) {
            if (Capsule::table(self::T_DELIVERIES)->where('delivery_id', $deliveryId)->exists()) {
                return false;
            }
            throw $e;
        }
    }

    public static function finishDelivery(string $deliveryId, string $outcome): void
    {
        Capsule::table(self::T_DELIVERIES)->where('delivery_id', $deliveryId)
            ->update(['outcome' => substr($outcome, 0, 191)]);
    }

    /** Lets YouPI's retry be processed again after a transient failure. */
    public static function forgetDelivery(string $deliveryId): void
    {
        Capsule::table(self::T_DELIVERIES)->where('delivery_id', $deliveryId)->delete();
    }

    public static function pruneDeliveries(int $days): void
    {
        Capsule::table(self::T_DELIVERIES)->where('received_at', '<', date('Y-m-d H:i:s', time() - $days * 86400))->delete();
    }

    // ----------------------------------------------------------------- state

    public static function getState(string $k): ?string
    {
        $row = Capsule::table(self::T_STATE)->where('k', $k)->first();
        return $row ? (string) $row->v : null;
    }

    public static function setState(string $k, string $v): void
    {
        $exists = Capsule::table(self::T_STATE)->where('k', $k)->exists();
        if ($exists) {
            Capsule::table(self::T_STATE)->where('k', $k)->update(['v' => $v, 'updated_at' => self::now()]);
        } else {
            Capsule::table(self::T_STATE)->insert(['k' => $k, 'v' => $v, 'updated_at' => self::now()]);
        }
    }

    // ------------------------------------------------------------ WHMCS data

    /** @return object|null tblaccounts row carrying this transaction id (any gateway) */
    public static function transaction(string $transId)
    {
        return Capsule::table('tblaccounts')->where('transid', $transId)->first();
    }

    /** @return object|null */
    public static function invoice(int $invoiceId)
    {
        return Capsule::table('tblinvoices')->where('id', $invoiceId)->first();
    }

    /** @return array{id:int, code:string}|null currency of the invoice's client */
    public static function invoiceCurrency(int $invoiceId): ?array
    {
        $inv = self::invoice($invoiceId);
        if (!$inv) {
            return null;
        }
        $client = Capsule::table('tblclients')->where('id', (int) $inv->userid)->first();
        $currencyId = $client ? (int) $client->currency : 0;
        $cur = $currencyId > 0
            ? Capsule::table('tblcurrencies')->where('id', $currencyId)->first()
            : Capsule::table('tblcurrencies')->where('default', 1)->first();
        if (!$cur) {
            return null;
        }
        return ['id' => (int) $cur->id, 'code' => strtoupper((string) $cur->code)];
    }

    /** @return int|null id of the INR currency row */
    public static function inrCurrencyId(): ?int
    {
        $cur = Capsule::table('tblcurrencies')->where('code', 'INR')->first();
        return $cur ? (int) $cur->id : null;
    }

    /**
     * Outstanding balance of the invoice in its own currency, as paise of that currency.
     * Uses the GetInvoice local API when available (it accounts for credit), else total - payments.
     */
    public static function invoiceBalancePaise(int $invoiceId): ?int
    {
        if (function_exists('localAPI')) {
            try {
                $r = localAPI('GetInvoice', ['invoiceid' => $invoiceId]);
                if (is_array($r) && ($r['result'] ?? '') === 'success' && isset($r['balance'])) {
                    return Money::fromDecimal($r['balance']);
                }
            } catch (\Throwable $e) {
                // fall through
            }
        }
        $inv = self::invoice($invoiceId);
        if (!$inv) {
            return null;
        }
        $in = Capsule::table('tblaccounts')->where('invoiceid', $invoiceId)->sum('amountin');
        $out = Capsule::table('tblaccounts')->where('invoiceid', $invoiceId)->sum('amountout');
        return Money::fromDecimal($inv->total) - Money::fromDecimal($in) + Money::fromDecimal($out);
    }
}
