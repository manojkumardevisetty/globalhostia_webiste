<?php
/**
 * GlobalHostia branded invoice PDF (WHMCS 8.x, TCPDF).
 * Upload to: <whmcs>/templates/<your active client theme>/invoicepdf.tpl  (keep a copy of the original first)
 * Uses only WHMCS's standard invoicepdf variables. Brand: ink #16212b, pink #c5386f, gold #fdd700.
 */

$ink = [22, 33, 43];
$pink = [197, 56, 111];
$muted = [107, 119, 133];
$line = [227, 231, 236];
$soft = [246, 247, 249];

$pdf->SetMargins(15, 15, 15);
$pdf->SetAutoPageBreak(true, 22);

# ---------------------------------------------------------------- header band
$pdf->SetFillColor($ink[0], $ink[1], $ink[2]);
$pdf->Rect(0, 0, 210, 44, 'F');
$pdf->SetFillColor($pink[0], $pink[1], $pink[2]);
$pdf->Rect(0, 44, 210, 1.6, 'F');

$logoFilename = '';
foreach (['logo-white.png', 'logo.png', 'logo.jpg'] as $f) {
    if (file_exists(ROOTDIR . '/assets/img/' . $f)) { $logoFilename = $f; break; }
}
if ($logoFilename) {
    // white rounded tile behind the logo so the colour logo reads on the dark band
    if ($logoFilename !== 'logo-white.png') {
        $pdf->SetFillColor(255, 255, 255);
        $pdf->RoundedRect(13, 10, 72, 24, 4, '1111', 'F');
    }
    $pdf->Image(ROOTDIR . '/assets/img/' . $logoFilename, 17, 13.5, 64, 0, '', '', '', true, 300);
} else {
    $pdf->SetFont('helvetica', 'B', 22);
    $pdf->SetTextColor(255, 255, 255);
    $pdf->SetXY(15, 15);
    $pdf->Cell(80, 12, $companyname, 0, 0, 'L');
}

# document title + status on the right of the band
$statusColours = [
    'Paid' => [46, 160, 90], 'Unpaid' => [229, 72, 77], 'Overdue' => [229, 72, 77], 'Cancelled' => [107, 119, 133],
    'Refunded' => [107, 119, 133], 'Collections' => [229, 72, 77], 'Payment Pending' => [217, 138, 0], 'Draft' => [107, 119, 133],
];
$sc = $statusColours[$status] ?? $pink;
$pdf->SetTextColor(255, 255, 255);
$pdf->SetFont('helvetica', 'B', 20);
$pdf->SetXY(110, 11);
$pdf->Cell(85, 9, strtoupper($pagetitle ?: Lang::trans('invoicestitle')), 0, 1, 'R');
$pdf->SetFont('helvetica', '', 10);
$pdf->SetX(110);
$pdf->Cell(85, 6, '#' . $invoicenum, 0, 1, 'R');
# status pill
$statusText = strtoupper(Lang::trans('invoices' . strtolower(str_replace(' ', '', $status))) ?: $status);
$pdf->SetFont('helvetica', 'B', 8.5);
$w = $pdf->GetStringWidth($statusText) + 8;
$pdf->SetFillColor($sc[0], $sc[1], $sc[2]);
$pdf->RoundedRect(195 - $w, 28, $w, 7, 3.5, '1111', 'F');
$pdf->SetXY(195 - $w, 28);
$pdf->Cell($w, 7, $statusText, 0, 0, 'C');

# ---------------------------------------------------------------- from / to / dates
$pdf->SetY(54);
$pdf->SetTextColor($ink[0], $ink[1], $ink[2]);

$col = function ($title, $body) use ($muted, $ink) {
    return '<div style="font-size:7.5pt;color:rgb(' . implode(',', $muted) . ');letter-spacing:1px;"><b>' . strtoupper($title) . '</b></div>'
        . '<div style="font-size:9.5pt;line-height:1.45;color:rgb(' . implode(',', $ink) . ');">' . $body . '</div>';
};

$from = '<b>' . htmlspecialchars($companyname) . '</b><br>' . implode('<br>', array_map('htmlspecialchars', (array) $companyaddress));

$to = '';
if (!empty($clientsdetails['companyname'])) {
    $to .= '<b>' . htmlspecialchars($clientsdetails['companyname']) . '</b><br>' . htmlspecialchars('ATTN: ' . $clientsdetails['firstname'] . ' ' . $clientsdetails['lastname']) . '<br>';
} else {
    $to .= '<b>' . htmlspecialchars($clientsdetails['firstname'] . ' ' . $clientsdetails['lastname']) . '</b><br>';
}
foreach (['address1', 'address2'] as $k) {
    if (!empty($clientsdetails[$k])) { $to .= htmlspecialchars($clientsdetails[$k]) . '<br>'; }
}
$to .= htmlspecialchars(trim($clientsdetails['city'] . ', ' . $clientsdetails['state'] . ' ' . $clientsdetails['postcode'], ', ')) . '<br>' . htmlspecialchars($clientsdetails['country']);
if (!empty($clientsdetails['tax_id'])) {
    $to .= '<br>' . htmlspecialchars(($taxIdLabel ?? 'Tax ID') . ': ' . $clientsdetails['tax_id']);
}
if (!empty($customfields)) {
    foreach ($customfields as $cf) { $to .= '<br>' . htmlspecialchars($cf['fieldname'] . ': ' . $cf['value']); }
}

$dates = '<table cellpadding="2" style="font-size:9.5pt;">'
    . '<tr><td style="color:rgb(' . implode(',', $muted) . ');">' . Lang::trans('invoicesdatecreated') . '</td><td align="right"><b>' . $datecreated . '</b></td></tr>'
    . '<tr><td style="color:rgb(' . implode(',', $muted) . ');">' . Lang::trans('invoicesdatedue') . '</td><td align="right"><b>' . $duedate . '</b></td></tr>'
    . ($status === 'Paid' && !empty($datepaid) ? '<tr><td style="color:rgb(' . implode(',', $muted) . ');">' . Lang::trans('invoicesdatepaid') . '</td><td align="right"><b>' . $datepaid . '</b></td></tr>' : '')
    . '</table>';

$pdf->writeHTML('<table cellpadding="0" cellspacing="0" width="100%"><tr>'
    . '<td width="34%">' . $col(Lang::trans('invoicespayto'), $from) . '</td>'
    . '<td width="34%">' . $col(Lang::trans('invoicesinvoicedto'), $to) . '</td>'
    . '<td width="32%">' . $col('Details', $dates) . '</td>'
    . '</tr></table>', true, false, false, false, '');

$pdf->Ln(6);

# ---------------------------------------------------------------- items
$rgb = function ($c) { return 'rgb(' . implode(',', $c) . ')'; };
$th = 'style="background-color:' . $rgb($ink) . ';color:#ffffff;font-weight:bold;font-size:8.5pt;"';
$html = '<table cellpadding="6" cellspacing="0" width="100%">'
    . '<tr><td width="76%" ' . $th . '>' . strtoupper(Lang::trans('invoicesdescription')) . '</td><td width="24%" align="right" ' . $th . '>' . strtoupper(Lang::trans('invoicesamount')) . '</td></tr>';
$i = 0;
foreach ($invoiceitems as $item) {
    $bg = ($i++ % 2) ? $rgb($soft) : '#ffffff';
    $html .= '<tr><td style="background-color:' . $bg . ';border-bottom:0.3px solid ' . $rgb($line) . ';font-size:9.5pt;">' . nl2br($item['description']) . '</td>'
        . '<td align="right" style="background-color:' . $bg . ';border-bottom:0.3px solid ' . $rgb($line) . ';font-size:9.5pt;">' . $item['amount'] . '</td></tr>';
}
$html .= '</table>';
$pdf->writeHTML($html, true, false, false, false, '');

# totals block (right aligned)
$row = function ($label, $value, $strong = false) use ($rgb, $muted, $ink) {
    return '<tr><td width="60%" align="right" style="color:' . $rgb($strong ? $ink : $muted) . ';font-size:' . ($strong ? '11' : '9.5') . 'pt;">' . ($strong ? '<b>' . $label . '</b>' : $label) . '</td>'
        . '<td width="40%" align="right" style="font-size:' . ($strong ? '11' : '9.5') . 'pt;">' . ($strong ? '<b>' . $value . '</b>' : $value) . '</td></tr>';
};
$tot = '<table cellpadding="3" cellspacing="0" width="100%">' . $row(Lang::trans('invoicessubtotal'), $subtotal);
if ($taxname) { $tot .= $row($taxrate . '% ' . $taxname, $tax); }
if ($taxname2) { $tot .= $row($taxrate2 . '% ' . $taxname2, $tax2); }
$tot .= $row(Lang::trans('invoicescredit'), $credit);
$tot .= '</table>';
$pdf->writeHTML('<table width="100%"><tr><td width="45%"></td><td width="55%">' . $tot . '</td></tr></table>', true, false, false, false, '');

# grand total bar
$y = $pdf->GetY() + 1;
$pdf->SetFillColor($pink[0], $pink[1], $pink[2]);
$pdf->RoundedRect(110, $y, 85, 11, 2.5, '1111', 'F');
$pdf->SetTextColor(255, 255, 255);
$pdf->SetFont('helvetica', 'B', 10);
$pdf->SetXY(113, $y + 2);
$pdf->Cell(35, 7, strtoupper(Lang::trans('invoicestotal')), 0, 0, 'L');
$pdf->SetFont('helvetica', 'B', 12);
$pdf->Cell(44, 7, $total, 0, 0, 'R');
$pdf->SetTextColor($ink[0], $ink[1], $ink[2]);
$pdf->SetY($y + 18);

# ---------------------------------------------------------------- transactions
$pdf->SetFont('helvetica', 'B', 11);
$pdf->Cell(0, 7, Lang::trans('invoicestransactions'), 0, 1, 'L');
$html = '<table cellpadding="5" cellspacing="0" width="100%">'
    . '<tr><td width="22%" ' . $th . '>' . strtoupper(Lang::trans('invoicestransdate')) . '</td><td width="28%" ' . $th . '>' . strtoupper(Lang::trans('invoicestransgateway')) . '</td>'
    . '<td width="30%" ' . $th . '>' . strtoupper(Lang::trans('invoicestransid')) . '</td><td width="20%" align="right" ' . $th . '>' . strtoupper(Lang::trans('invoicestransamount')) . '</td></tr>';
if (!count($transactions)) {
    $html .= '<tr><td colspan="4" align="center" style="color:' . $rgb($muted) . ';font-size:9pt;">' . Lang::trans('invoicestransnonefound') . '</td></tr>';
} else {
    foreach ($transactions as $t) {
        $html .= '<tr><td style="border-bottom:0.3px solid ' . $rgb($line) . ';font-size:9pt;">' . $t['date'] . '</td><td style="border-bottom:0.3px solid ' . $rgb($line) . ';font-size:9pt;">' . $t['gateway'] . '</td>'
            . '<td style="border-bottom:0.3px solid ' . $rgb($line) . ';font-size:9pt;">' . $t['transid'] . '</td><td align="right" style="border-bottom:0.3px solid ' . $rgb($line) . ';font-size:9pt;">' . $t['amount'] . '</td></tr>';
    }
}
$html .= '<tr><td colspan="3" align="right" style="background-color:' . $rgb($soft) . ';font-size:9.5pt;"><b>' . Lang::trans('invoicesbalance') . '</b></td><td align="right" style="background-color:' . $rgb($soft) . ';font-size:9.5pt;"><b>' . $balance . '</b></td></tr></table>';
$pdf->writeHTML($html, true, false, false, false, '');

# ---------------------------------------------------------------- notes + footer
if ($notes) {
    $pdf->Ln(4);
    $pdf->writeHTML('<div style="font-size:8.5pt;color:' . $rgb($muted) . ';"><b>' . Lang::trans('invoicesnotes') . ':</b> ' . nl2br($notes) . '</div>', true, false, false, false, '');
}

$pdf->SetY(-28);
$pdf->SetDrawColor($line[0], $line[1], $line[2]);
$pdf->Line(15, $pdf->GetY(), 195, $pdf->GetY());
$pdf->Ln(2);
$pdf->SetFont('helvetica', '', 8);
$pdf->SetTextColor($muted[0], $muted[1], $muted[2]);
$pdf->Cell(0, 5, 'Thank you for choosing GlobalHostia  ·  globalhostia.com  ·  support@globalhostia.com  ·  24/7 support', 0, 1, 'C');
$pdf->Cell(0, 5, Lang::trans('invoicepdfgenerated') . ' ' . getTodaysDate(1), 0, 1, 'C');
