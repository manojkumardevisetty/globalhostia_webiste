// Local mock of the WHMCS API (subset) for development & automated tests.
// Usage: node tests/mock-whmcs.mjs  → http://127.0.0.1:4555/includes/api.php
import http from 'node:http';

const cards = (gid, group, list) => list.map(([pid, slug, name, monthly, annually, desc]) => ({
  pid, gid, type: 'hostingaccount', name, slug, product_url: `https://globalhostia.com/secure/store/${group}/${slug}`,
  description: desc, module: 'cpanel', paytype: 'recurring',
  pricing: { USD: { prefix: '$', suffix: 'USD', msetupfee: '0.00', qsetupfee: '0.00', ssetupfee: '0.00', asetupfee: '0.00', bsetupfee: '0.00', tsetupfee: '0.00', monthly, quarterly: '-1.00', semiannually: '-1.00', annually, biennially: '-1.00', triennially: '-1.00' } },
}));
const products = [
  ...cards(1, 'hostia-shared', [[1, 'hostia-lite', 'Hostia Lite', '2.99', '29.99', '2 GB of Space<br />\n50 GB Bandwidth<br />\n10 Email Id\'s'], [2, 'hostia-ultra', 'Hostia Ultra', '5.99', '59.99', '10 GB NVMe<br />Unlimited Bandwidth<br />5 Websites'], [3, 'hostia-infinity', 'Hostia Infinity', '9.99', '99.99', 'Unlimited NVMe<br />Unlimited Websites<br />Free SSL']]),
  ...cards(2, 'hosting-usa', [[4, 'hostia-lite-usa', 'Hostia Lite USA', '2.99', '29.99', '2 GB of Space<br />USA datacenter']]),
  ...cards(5, 'ssl-certificates', [[20, 'positivessl-dv', 'PositiveSSL DV', '-1.00', '9.23', 'Domain validation<br />1 domain'], [21, 'thawte-ssl123-flex', 'Thawte SSL123 Flex', '-1.00', '49.22', 'DV<br />Flex SANs'], [22, 'essentialssl-wildcard-dv', 'EssentialSSL Wildcard DV', '-1.00', '109.51', 'Wildcard<br />DV']]),
  ...cards(7, 'dedicated-servers', Array.from({ length: 14 }, (_, i) => [100 + i, `hostia-ded-${i}`, `Hostia Dedicated ${i + 1}`, (39.99 + i * 10).toFixed(2), '-1.00', `${4 + i * 2} cores<br />${16 + i * 8}GB RAM`])),
];

const handlers = {
  WhmcsDetails: () => ({ whmcs: { version: '8.10.1-release.1' } }),
  GetProducts: () => ({ totalresults: products.length, products: { product: products } }),
  GetCurrencies: () => ({ totalresults: 1, currencies: { currency: [{ id: 1, code: 'USD', prefix: '$', suffix: ' USD', default: 1 }] } }),
  GetTLDPricing: () => ({ currency: { code: 'USD' }, pricing: {
    com: { register: { 1: '13.65' }, transfer: { 1: '13.65' }, renew: { 1: '13.99' } }, net: { register: { 1: '8.29' }, transfer: { 1: '11.29' }, renew: { 1: '11.29' } },
    org: { register: { 1: '8.65' }, transfer: { 1: '8.65' }, renew: { 1: '12.65' } }, shop: { register: { 1: '1.20' }, transfer: { 1: '25.00' }, renew: { 1: '29.00' } },
    ae: { register: { 1: '35.00' }, transfer: { 1: '35.00' }, renew: { 1: '35.00' } }, io: { register: { 1: '49.00' }, transfer: { 1: '49.00' }, renew: { 1: '49.00' } } } }),
  DomainWhois: (p) => ({ status: /google|globalhostia/.test(p.domain) ? 'unavailable' : 'available' }),
  GetStats: () => ({ income_today: '$120.00', income_thismonth: '$4,210.00', orders_pending: 3, orders_today_total: 5, tickets_open: 2, tickets_awaitingreply: 1 }),
  GetOrders: () => ({ totalresults: 1, orders: { order: [{ id: 501, ordernum: '8812', date: '2026-10-30 10:00:00', name: 'Test Client', amount: '5.99', paymentmethod: 'stripe', paymentstatus: 'Paid', status: 'Pending', userid: 7 }] } }),
  GetClients: () => ({ totalresults: 1, clients: { client: [{ id: 7, firstname: 'Test', lastname: 'Client', companyname: 'ACME', email: 'test@example.com', datecreated: '2026-01-02', status: 'Active' }] } }),
  GetClientsProducts: () => ({ products: { product: [{ id: 11, name: 'Hostia Ultra', domain: 'acme.ae', status: 'Active', recurringamount: '5.99', billingcycle: 'Monthly', nextduedate: '2026-11-30' }] } }),
  GetTickets: () => ({ tickets: { ticket: [] } }),
  GetPromotions: () => ({ promotions: { promotion: [{ id: 1, code: 'WELCOME10', type: 'Percentage', value: '10.00', uses: 4, maxuses: 0, expirationdate: '0000-00-00' }] } }),
  AddProduct: () => ({ pid: 999 }),
};

http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const p = Object.fromEntries(new URLSearchParams(b));
    res.setHeader('content-type', 'application/json');
    if (p.identifier !== 'test' || p.secret !== 'test') return res.end(JSON.stringify({ result: 'error', message: 'Authentication Failed' }));
    const h = handlers[p.action];
    res.end(JSON.stringify(h ? { result: 'success', ...h(p) } : { result: 'error', message: `Unsupported action ${p.action}` }));
  });
}).listen(4555, '127.0.0.1', () => console.log('mock WHMCS on :4555'));
