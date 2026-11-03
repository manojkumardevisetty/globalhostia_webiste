<?php
/**
 * Simulation of the webhook/reconcile payment logic with an in-memory stand-in for
 * WHMCS\Database\Capsule and the WHMCS invoice functions. No WHMCS install needed.
 *
 *   php tests/processor-sim.php
 *
 * This checks the module's decisions (pay / hold / duplicate / ignore). It does not prove
 * behaviour of the real WHMCS functions, which must be tested on a staging WHMCS.
 */

namespace WHMCS\Database {
    final class FakeDb
    {
        /** @var array<string, array<int, array<string,mixed>>> */
        public static $t = [];
        /** @var array<string,string> */
        public static $pk = ['mod_youpi_deliveries' => 'delivery_id', 'mod_youpi_state' => 'k'];
        /** @var array<string,string> */
        public static $unique = ['mod_youpi_orders' => 'order_id'];
    }

    final class FakeCollection
    {
        private $rows;
        public function __construct(array $rows) { $this->rows = $rows; }
        public function all(): array { return $this->rows; }
    }

    final class FakeQuery
    {
        private $table; private $wheres = []; private $order = []; private $limit = null;
        public function __construct(string $table) { $this->table = $table; FakeDb::$t[$table] = FakeDb::$t[$table] ?? []; }
        public function where($c, $op, $v = null) { if (func_num_args() === 2) { $v = $op; $op = '='; } $this->wheres[] = [$c, $op, $v]; return $this; }
        public function whereIn($c, array $v) { $this->wheres[] = [$c, 'in', $v]; return $this; }
        public function whereNotIn($c, array $v) { $this->wheres[] = [$c, 'notin', $v]; return $this; }
        public function whereNotNull($c) { $this->wheres[] = [$c, 'notnull', null]; return $this; }
        public function orderBy($c, $d = 'asc') { $this->order[] = [$c, strtolower($d)]; return $this; }
        public function limit($n) { $this->limit = $n; return $this; }
        private function match(array $r): bool {
            foreach ($this->wheres as [$c, $op, $v]) {
                $x = $r[$c] ?? null;
                switch ($op) {
                    case '=': if ((string) $x !== (string) $v) return false; break;
                    case '<>': if ((string) $x === (string) $v) return false; break;
                    case '<': if (!($x !== null && $x < $v)) return false; break;
                    case '>=': if (!($x !== null && $x >= $v)) return false; break;
                    case 'in': if (!in_array($x, $v, false)) return false; break;
                    case 'notin': if (in_array($x, $v, false)) return false; break;
                    case 'notnull': if ($x === null) return false; break;
                }
            }
            return true;
        }
        private function keys(): array { $o = []; foreach (FakeDb::$t[$this->table] as $k => $r) { if ($this->match($r)) $o[] = $k; } return $o; }
        public function get() {
            $rows = [];
            foreach ($this->keys() as $k) $rows[] = FakeDb::$t[$this->table][$k];
            foreach (array_reverse($this->order) as [$c, $d]) {
                usort($rows, function ($a, $b) use ($c, $d) { $r = ($a[$c] ?? '') <=> ($b[$c] ?? ''); return $d === 'desc' ? -$r : $r; });
            }
            if ($this->limit !== null) $rows = array_slice($rows, 0, $this->limit);
            return new FakeCollection(array_map(function ($r) { return (object) $r; }, $rows));
        }
        public function first() { $a = $this->get()->all(); return $a[0] ?? null; }
        public function exists(): bool { return count($this->keys()) > 0; }
        public function sum($c) { $s = 0.0; foreach ($this->keys() as $k) $s += (float) FakeDb::$t[$this->table][$k][$c]; return $s; }
        public function update(array $f): int { $n = 0; foreach ($this->keys() as $k) { FakeDb::$t[$this->table][$k] = array_merge(FakeDb::$t[$this->table][$k], $f); $n++; } return $n; }
        public function delete(): int { $n = 0; foreach ($this->keys() as $k) { unset(FakeDb::$t[$this->table][$k]); $n++; } return $n; }
        public function insert(array $r) {
            foreach ([FakeDb::$pk[$this->table] ?? null, FakeDb::$unique[$this->table] ?? null] as $u) {
                if ($u !== null) foreach (FakeDb::$t[$this->table] as $e) if (($e[$u] ?? null) === ($r[$u] ?? null)) throw new \RuntimeException('Duplicate entry');
            }
            FakeDb::$t[$this->table][] = $r; return true;
        }
        public function insertGetId(array $r) { $id = count(FakeDb::$t[$this->table]) + 1; $r['id'] = $id; $this->insert($r); return $id; }
    }

    final class FakeSchema
    {
        public function hasTable($t) { return isset(FakeDb::$t[$t]); }
        public function create($t, $fn) { FakeDb::$t[$t] = []; }
    }

    final class Capsule
    {
        public static function table($t) { return new FakeQuery($t); }
        public static function schema() { return new FakeSchema(); }
    }
}

namespace {
    define('WHMCS', true);
    require __DIR__ . '/../modules/gateways/youpi/bootstrap.php';

    use GlobalHostia\YouPI\Config;
    use GlobalHostia\YouPI\Processor;
    use GlobalHostia\YouPI\Store;
    use WHMCS\Database\Capsule;
    use WHMCS\Database\FakeDb;

    $LOG = []; $MAIL = []; $PAID = [];
    function logTransaction($g, $d, $s) { global $LOG; $LOG[] = [$s, $d['_outcome'] ?? '']; }
    function logActivity($m) {}
    function checkCbInvoiceID($id, $g) { if (!Capsule::table('tblinvoices')->where('id', $id)->exists()) die("bad invoice\n"); return $id; }
    function checkCbTransID($t) { if (Capsule::table('tblaccounts')->where('transid', $t)->exists()) die("dup trans\n"); }
    function addInvoicePayment($inv, $trans, $amount, $fee, $gw) {
        global $PAID; $PAID[] = [$inv, $trans, $amount, $gw];
        Capsule::table('tblaccounts')->insert(['invoiceid' => $inv, 'transid' => $trans, 'amountin' => $amount, 'amountout' => 0]);
        Capsule::table('tblinvoices')->where('id', $inv)->update(['status' => 'Paid']);
    }
    function localAPI($cmd, $v) {
        global $MAIL;
        if ($cmd === 'SendAdminEmail') { $MAIL[] = $v['customsubject']; return ['result' => 'success']; }
        if ($cmd === 'UpdateInvoice') { Capsule::table('tblinvoices')->where('id', $v['invoiceid'])->update(['notes' => $v['notes']]); return ['result' => 'success']; }
        return ['result' => 'error'];
    }

    $pass = 0; $fail = 0;
    function t($name, $cond, $detail = '') { global $pass, $fail; if ($cond) { $pass++; echo "  ok    $name\n"; } else { $fail++; echo "  FAIL  $name $detail\n"; } }

    function reset_db(string $clientCurrency = 'INR') {
        global $LOG, $MAIL, $PAID; $LOG = []; $MAIL = []; $PAID = [];
        FakeDb::$t = [];
        Capsule::table('tblcurrencies')->insert(['id' => 1, 'code' => 'INR', 'default' => 1]);
        Capsule::table('tblcurrencies')->insert(['id' => 2, 'code' => 'USD', 'default' => 0]);
        Capsule::table('tblclients')->insert(['id' => 7, 'currency' => $clientCurrency === 'INR' ? 1 : 2]);
        Capsule::table('tblinvoices')->insert(['id' => 1042, 'userid' => 7, 'status' => 'Unpaid', 'total' => '1499.00', 'notes' => '']);
        Capsule::table('tblinvoices')->insert(['id' => 2000, 'userid' => 7, 'status' => 'Unpaid', 'total' => '10.00', 'notes' => '']);
        Capsule::table('tblaccounts')->insert(['invoiceid' => 2000, 'transid' => '999999999999', 'amountin' => '10.00', 'amountout' => 0]);
        (function () { $r = new \ReflectionProperty(Store::class, 'ready'); $r->setAccessible(true); $r->setValue(null, false); })();
        Store::ensureSchema();
        Capsule::table('mod_youpi_orders')->insertGetId(['invoice_id' => 1042, 'order_id' => 'WHMCS-1042-k3m7q2xa', 'amount_paise' => 149900, 'currency' => 'INR', 'payment_id' => 'c7942127-14e3-469a-9e4a-9359a16f903a', 'status' => 'PENDING', 'utr' => null, 'review_reason' => null, 'flagged_at' => null, 'claimed_at' => null, 'created_at' => date('Y-m-d H:i:s')]);
    }
    function ev(array $over = []): array {
        return array_merge(['event' => 'OBSERVED_SUCCESS', 'orderId' => 'WHMCS-1042-k3m7q2xa', 'paymentId' => 'c7942127-14e3-469a-9e4a-9359a16f903a',
            'amount' => '1499.00', 'amountPaise' => 149900, 'currency' => 'INR', 'method' => 'UPI', 'utr' => '412345678901'], $over);
    }
    function row() { return Store::findOrder('WHMCS-1042-k3m7q2xa'); }
    $gw = ['name' => 'youpi', 'paymentmethod' => 'youpi', 'type' => 'Invoices'];
    $cfgFor = function (array $o = []) { return Config::fromParams(array_merge(['reviewAbove' => '5000', 'confirmOn' => 'observed'], $o)); };

    echo "Observed mode, below threshold\n";
    reset_db();
    $r = Processor::handle($gw, $cfgFor(), ev(), 'webhook');
    t('pays the invoice', $r['http'] === 200 && strpos($r['outcome'], 'Success') === 0 && count($PAID) === 1, $r['outcome']);
    t('transaction id is the UTR, amount in INR', $PAID[0][1] === '412345678901' && $PAID[0][2] === '1499.00');
    t('row marked PAID', row()->status === 'PAID' && row()->utr === '412345678901');
    $r = Processor::handle($gw, $cfgFor(), ev(['event' => 'RECONCILED']), 'webhook');
    t('later RECONCILED for same UTR is a duplicate', strpos($r['outcome'], 'Duplicate') === 0 && count($PAID) === 1, $r['outcome']);

    echo "Manual review threshold\n";
    reset_db();
    $r = Processor::handle($gw, $cfgFor(['reviewAbove' => '1000']), ev(), 'webhook');
    t('held, not paid', strpos($r['outcome'], 'Held') === 0 && count($PAID) === 0, $r['outcome']);
    t('admin emailed once', count($MAIL) === 1);
    t('client-visible note added', strpos((string) Capsule::table('tblinvoices')->where('id', 1042)->first()->notes, 'ref ending 8901') !== false);
    Processor::handle($gw, $cfgFor(['reviewAbove' => '1000']), ev(['event' => 'RECONCILED']), 'webhook');
    t('second event does not email again', count($MAIL) === 1 && count($PAID) === 0);

    echo "Amount checks\n";
    reset_db();
    $r = Processor::handle($gw, $cfgFor(), ev(['amount' => '1.00', 'amountPaise' => 100]), 'webhook');
    t('underpayment held', strpos($r['outcome'], 'Held') === 0 && count($PAID) === 0, $r['outcome']);
    reset_db();
    $r = Processor::handle($gw, $cfgFor(), ev(['amount' => '1499.00', 'amountPaise' => 149901]), 'webhook');
    t('amount/amountPaise disagreement rejected 400', $r['http'] === 400 && count($PAID) === 0);
    reset_db();
    Capsule::table('tblinvoices')->where('id', 1042)->update(['total' => '1599.00']);
    $r = Processor::handle($gw, $cfgFor(), ev(), 'webhook');
    t('invoice total changed after order: held', strpos($r['outcome'], 'Held') === 0 && count($PAID) === 0, $r['outcome']);

    echo "Confirmation level\n";
    reset_db();
    $r = Processor::handle($gw, $cfgFor(['confirmOn' => 'reconciled']), ev(), 'webhook');
    t('reconciled mode: OBSERVED does not pay', strpos($r['outcome'], 'Pending') === 0 && count($PAID) === 0 && row()->status === 'OBSERVED', $r['outcome']);
    $r = Processor::handle($gw, $cfgFor(['confirmOn' => 'reconciled']), ev(['event' => 'RECONCILED']), 'webhook');
    t('reconciled mode: RECONCILED pays', strpos($r['outcome'], 'Success') === 0 && count($PAID) === 1, $r['outcome']);

    echo "Other events and tampering\n";
    reset_db();
    $r = Processor::handle($gw, $cfgFor(), ev(['utr' => '999999999999']), 'webhook');
    t('UTR already used on another invoice: held', strpos($r['outcome'], 'Held') === 0 && count($PAID) === 0, $r['outcome']);
    reset_db();
    $r = Processor::handle($gw, $cfgFor(), ev(['event' => 'SUCCESS']), 'webhook');
    t('SUCCESS (COD/counter) never pays', count($PAID) === 0 && strpos($r['outcome'], 'Held') === 0);
    reset_db();
    $r = Processor::handle($gw, $cfgFor(), ev(['event' => 'EXPIRED', 'utr' => '']), 'webhook');
    t('EXPIRED recorded', row()->status === 'EXPIRED' && $r['http'] === 200);
    reset_db();
    $r = Processor::handle($gw, $cfgFor(), ev(['utr' => '']), 'webhook');
    t('missing UTR: held', strpos($r['outcome'], 'Held') === 0 && count($PAID) === 0);
    reset_db();
    $r = Processor::handle($gw, $cfgFor(), ev(['orderId' => 'WHMCS-1043-k3m7q2xa']), 'webhook');
    t('unknown order ignored with alert', $r['http'] === 200 && count($PAID) === 0 && count($MAIL) === 1, $r['outcome']);
    reset_db();
    $r = Processor::handle($gw, $cfgFor(), ev(['method' => 'COD']), 'webhook');
    t('non-UPI method held', count($PAID) === 0);
    reset_db();
    Capsule::table('tblinvoices')->where('id', 1042)->update(['status' => 'Cancelled']);
    $r = Processor::handle($gw, $cfgFor(), ev(), 'webhook');
    t('cancelled invoice: held for refund decision', strpos($r['outcome'], 'Held') === 0 && count($PAID) === 0);

    echo "Currency\n";
    reset_db('USD');
    $r = Processor::handle($gw, $cfgFor(), ev(), 'webhook');
    t('USD client with Accept-only-INR: held', strpos($r['outcome'], 'Held') === 0 && count($PAID) === 0, $r['outcome']);

    echo "Concurrency claim\n";
    reset_db();
    Store::updateOrder((int) row()->id, ['status' => 'APPLYING', 'claimed_at' => date('Y-m-d H:i:s')]);
    $r = Processor::handle($gw, $cfgFor(), ev(), 'webhook');
    t('second worker backs off while row is APPLYING', strpos($r['outcome'], 'In progress') === 0 && count($PAID) === 0, $r['outcome']);

    echo "\n$pass passed, $fail failed\n";
    exit($fail === 0 ? 0 : 1);
}
