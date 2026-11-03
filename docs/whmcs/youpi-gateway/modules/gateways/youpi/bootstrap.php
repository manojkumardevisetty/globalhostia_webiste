<?php
/**
 * Loads the YouPI gateway library. Safe to include more than once.
 */

if (!defined('YOUPI_GATEWAY_VERSION')) {
    define('YOUPI_GATEWAY_VERSION', '1.0.0');
}

require_once __DIR__ . '/lib/Util.php';
require_once __DIR__ . '/lib/Signature.php';
require_once __DIR__ . '/lib/Config.php';
require_once __DIR__ . '/lib/ApiClient.php';

// The remaining classes use WHMCS (Capsule, invoice functions) and are only loaded inside WHMCS.
if (defined('WHMCS')) {
    require_once __DIR__ . '/lib/Store.php';
    require_once __DIR__ . '/lib/Processor.php';
    require_once __DIR__ . '/lib/Reconciler.php';
    require_once __DIR__ . '/lib/View.php';
}
