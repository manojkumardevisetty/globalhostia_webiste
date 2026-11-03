// Customer policies for AI agents (MCP get_policies, /ask, llms-full.txt, markdown pages).
// Every statement is a summary of the published Terms & Conditions (/terms-conditions, sections 5, 6 and 10);
// the money-back line is only shown while the owner keeps the "money-back" trust point switched on (Admin > Settings).
// If the terms change, update this file: agents are told the terms page is authoritative.
import 'server-only';
import { trustOn, trustText } from '../theme/growth';
import type { Settings } from '../settings';

export type Policy = { id: string; title: string; summary: string; section: string };

export function policies(s: Partial<Settings>, site: string, base: string) {
  const email = String(s.email || 'support@globalhostia.com');
  const list: Policy[] = [];
  if (trustOn(s, 'money-back')) {
    list.push({ id: 'money_back', title: 'Money-back guarantee (hosting)', section: '6.1',
      summary: `${trustText(s, 'money-back') || 'Money-back guarantee on hosting'}. Per the terms: new hosting customers may request a full refund within 30 days of the initial purchase; this covers hosting services only and excludes domain registrations, SSL certificates, setup fees and add-on services.` });
  }
  list.push(
    { id: 'domain_refunds', title: 'Domain refunds', section: '6.2', summary: 'Domain registrations are generally non-refundable because of registry fees. A refund may be issued within 5 days if the domain has not been used and no DNS changes were made, minus registry fees.' },
    { id: 'ssl_refunds', title: 'SSL certificate refunds', section: '6.3', summary: 'SSL certificates are non-refundable once issued; refund requests must be made before issuance.' },
    { id: 'cancellation', title: 'Cancellation', section: '6.4', summary: `Cancel at any time from the client area (${base}/clientarea.php) or by emailing ${email}. Cancellation takes effect at the end of the current billing cycle; unused time is not refunded pro rata.` },
    { id: 'renewal', title: 'Automatic renewal', section: '5.4, 5.7', summary: 'Services renew automatically at the then-current price unless cancelled before the end of the billing cycle. Price changes are announced 30 days ahead and apply from the next renewal. The renewal price for each plan and domain is returned by the catalog tools.' },
    { id: 'billing', title: 'Billing', section: '5.2, 5.5', summary: 'Billed in advance for the chosen cycle (monthly, quarterly, semi-annual, annual, 2 or 3 years where offered). Unpaid services may be suspended.' },
    { id: 'taxes', title: 'Taxes and VAT', section: '5.1, 5.6', summary: 'Prices are shown exclusive of applicable taxes; plan cards state "+VAT 5% where applicable" (UAE VAT). The customer is responsible for applicable taxes; any tax due is shown on the invoice at checkout.' },
    { id: 'domain_renewal', title: 'Domain renewal and expiry', section: '10.4', summary: 'Renew domains before they expire. Expired domains usually enter a grace period of about 30 days, then a redemption period (where the registry offers one) with extra fees.' },
    { id: 'data_retention', title: 'Data after cancellation', section: '6.6', summary: 'Data is kept for 15 days after cancellation or termination, then permanently deleted.' },
  );
  return { source: `${site}/terms-conditions`, note: 'Summary of the published Terms & Conditions. The terms page is authoritative; quote it for anything not covered here.', policies: list, privacy: `${site}/privacy-policy`, contact: `${site}/contact` };
}
