<?php
/**
 * YouPI reconciliation safety net.
 *
 * WHMCS does not load hooks from gateway folders, so this file lives in includes/hooks/.
 * It runs after every WHMCS cron (normally every 5 minutes) and itself throttles to one
 * pass every 10 minutes. It polls YouPI for orders still open on unpaid invoices and applies
 * the same verification as the webhook (see modules/gateways/youpi/lib/Reconciler.php).
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

add_hook('AfterCronJob', 1, function ($vars) {
    $bootstrap = ROOTDIR . '/modules/gateways/youpi/bootstrap.php';
    if (!is_file($bootstrap)) {
        return;
    }
    try {
        require_once ROOTDIR . '/includes/gatewayfunctions.php';
        require_once ROOTDIR . '/includes/invoicefunctions.php';
        require_once $bootstrap;
        \GlobalHostia\YouPI\Reconciler::run();
    } catch (\Throwable $e) {
        logActivity('[YouPI] reconcile failed: ' . substr($e->getMessage(), 0, 300));
    }
});
