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


// ---------------------------------------------------------------------------------------------
// Customer-portal fixtures (client 1 = demo@example.com / "demo-pass", client 2 = other@example.com,
// client 7 = the admin fixture). State is in memory, so ticket replies / nameserver edits persist per run.
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const err = (message) => { const e = new Error(message); e.api = true; throw e; };
const clients = {
  1: { id: 1, userid: 1, firstname: 'Demo', lastname: 'Customer', fullname: 'Demo Customer', companyname: 'Demo Labs FZ-LLC', email: 'demo@example.com', address1: 'Office 1204, Bay Square 5', city: 'Dubai', state: 'Dubai', postcode: '00000', country: 'AE', countrycode: 'AE', countryname: 'United Arab Emirates', phonenumber: '+971 4 555 0100', status: 'Active', currency: 1, currency_code: 'USD', twofaenabled: false },
  2: { id: 2, userid: 2, firstname: 'Other', lastname: 'Person', companyname: '', email: 'other@example.com', address1: '1 Main St', city: 'Austin', state: 'TX', postcode: '73301', country: 'US', countrycode: 'US', status: 'Active', currency: 1, currency_code: 'USD' },
  7: { id: 7, userid: 7, firstname: 'Test', lastname: 'Client', email: 'test@example.com', companyname: 'ACME', country: 'AE', city: 'Dubai', status: 'Active', currency_code: 'USD', datecreated: '2026-01-02' },
};
const passwords = { 'demo@example.com': 'demo-pass', 'other@example.com': 'other-pass', 'tfa@example.com': 'tfa-pass' };
const services = {
  1: [
    { id: 101, clientid: 1, pid: 120, name: 'Cloud VPS 4', translated_name: 'Cloud VPS 4', groupname: 'Servers', module: 'vpsautomation', domain: 'vps1.demo-brand.com', dedicatedip: '203.0.113.24', assignedips: '203.0.113.25\n203.0.113.26', username: 'root', password: 'NEVER-SHOW-THIS', serverhostname: 'node7.rdp.example', regdate: day(-200), firstpaymentamount: '24.00', recurringamount: '24.00', billingcycle: 'Monthly', nextduedate: day(12), status: 'Active', paymentmethodname: 'Credit Card',
      configoptions: { configoption: [{ id: 1, option: 'Operating System', type: 'dropdown', value: 'Ubuntu 24.04 LTS' }, { id: 2, option: 'Location', type: 'dropdown', value: 'Frankfurt, DE' }, { id: 3, option: 'vCPU', type: 'dropdown', value: '4 cores' }, { id: 4, option: 'Memory', type: 'dropdown', value: '8 GB' }, { id: 5, option: 'NVMe Storage', type: 'dropdown', value: '160 GB' }] } },
    { id: 102, clientid: 1, pid: 2, name: 'Hostia Ultra', groupname: 'Shared Hosting', module: 'cpanel', domain: 'demo-brand.com', dedicatedip: '', assignedips: '', username: 'demobran', password: 'NEVER-SHOW-THIS', regdate: day(-400), firstpaymentamount: '59.99', recurringamount: '59.99', billingcycle: 'Annually', nextduedate: day(140), status: 'Active', paymentmethodname: 'PayPal', configoptions: { configoption: [] } },
    { id: 103, clientid: 1, pid: 20, name: 'PositiveSSL DV', groupname: 'SSL Certificates', module: 'ssl', domain: 'shop.demo-brand.com', regdate: day(-700), firstpaymentamount: '9.23', recurringamount: '9.23', billingcycle: 'Annually', nextduedate: day(-30), status: 'Cancelled' },
  ],
  2: [{ id: 201, clientid: 2, pid: 1, name: 'Hostia Lite', groupname: 'Shared Hosting', module: 'cpanel', domain: 'other-site.com', username: 'other', password: 'x', regdate: day(-50), recurringamount: '2.99', billingcycle: 'Monthly', nextduedate: day(10), status: 'Active' }],
  7: [{ id: 11, clientid: 7, name: 'Hostia Ultra', domain: 'acme.ae', status: 'Active', recurringamount: '5.99', billingcycle: 'Monthly', nextduedate: '2026-11-30' }],
};
const domains = {
  1: [
    { id: 301, userid: 1, domainname: 'demo-brand.com', regdate: day(-345), expirydate: day(20), nextduedate: day(20), recurringamount: '13.99', regperiod: 1, status: 'Active', donotrenew: false, idprotection: true, ns: ['ns1.globalhostia.com', 'ns2.globalhostia.com'] },
    { id: 302, userid: 1, domainname: 'demo.ae', regdate: day(-100), expirydate: day(265), nextduedate: day(265), recurringamount: '35.00', regperiod: 1, status: 'Active', donotrenew: true, idprotection: false, ns: ['ns1.globalhostia.com', 'ns2.globalhostia.com', 'ns3.globalhostia.com'] },
  ],
  2: [{ id: 401, userid: 2, domainname: 'other-site.com', expirydate: day(200), status: 'Active', ns: ['ns1.other.net', 'ns2.other.net'] }],
  7: [{ id: 3, userid: 7, domainname: 'acme.ae', expirydate: '2027-10-01', status: 'Active', ns: [] }],
};
const invoices = {
  5001: { invoiceid: 5001, id: 5001, userid: 1, invoicenum: '', date: day(-5), duedate: day(2), datepaid: '0000-00-00 00:00:00', subtotal: '24.00', credit: '0.00', tax: '1.20', tax2: '0.00', total: '25.20', balance: '25.20', taxrate: '5.00', status: 'Unpaid', paymentmethod: 'stripe', currencycode: 'USD',
    items: { item: [{ id: 1, type: 'Hosting', relid: 101, description: `Cloud VPS 4 - vps1.demo-brand.com (${day(12)} - ${day(42)})`, amount: '24.00', taxed: 1 }] } },
  5000: { invoiceid: 5000, id: 5000, userid: 1, invoicenum: '', date: day(-40), duedate: day(-33), datepaid: day(-34) + ' 10:12:00', subtotal: '73.98', credit: '0.00', tax: '3.70', tax2: '0.00', total: '77.68', balance: '0.00', taxrate: '5.00', status: 'Paid', paymentmethod: 'paypal', currencycode: 'USD',
    items: { item: [{ id: 2, type: 'Hosting', relid: 102, description: 'Hostia Ultra - demo-brand.com', amount: '59.99', taxed: 1 }, { id: 3, type: 'Domain', relid: 301, description: 'Domain Renewal - demo-brand.com - 1 Year/s', amount: '13.99', taxed: 1 }] } },
  6001: { invoiceid: 6001, id: 6001, userid: 2, date: day(-3), duedate: day(4), subtotal: '2.99', total: '2.99', balance: '2.99', status: 'Unpaid', items: { item: [{ description: 'Hostia Lite', amount: '2.99' }] } },
  90: { invoiceid: 90, id: 90, userid: 7, invoicenum: '', date: '2026-10-01', total: '5.99', status: 'Paid', items: { item: [] } },
};
const tickets = {
  7001: { ticketid: 7001, id: 7001, tid: 'GHX-482915', c: 'abc', deptid: 1, deptname: 'Technical Support', userid: 1, name: 'Demo Customer', email: 'demo@example.com', date: day(-1) + ' 09:14:00', subject: 'VPS reboot loop after kernel update', status: 'Answered', priority: 'High', lastreply: now(),
    replies: [
      { replyid: 0, userid: 1, name: 'Demo Customer', date: day(-1) + ' 09:14:00', message: 'Hi team,\r\n\r\nAfter running apt upgrade on vps1.demo-brand.com the server keeps rebooting.\r\nCan you check from the host side? <script>alert(1)</script>', admin: '' },
      { replyid: 1, userid: 0, name: '', date: day(-1) + ' 09:31:00', message: 'Hello,\n\nThanks for the details. We see the new kernel failing to mount the root volume. We booted the previous kernel from rescue and pinned it.\n\nThe server is up again. Please reply if you want us to retry the upgrade during a maintenance window.', admin: 'Rahul S.' },
    ] },
  7000: { ticketid: 7000, id: 7000, tid: 'GHX-310442', deptid: 2, deptname: 'Billing', userid: 1, date: day(-60) + ' 12:00:00', subject: 'Invoice address change', status: 'Closed', priority: 'Low', lastreply: day(-58) + ' 08:00:00', replies: [{ replyid: 0, userid: 1, name: 'Demo Customer', date: day(-60) + ' 12:00:00', message: 'Please update our company address on invoices.', admin: '' }] },
  8001: { ticketid: 8001, id: 8001, tid: 'OTH-100001', deptid: 1, deptname: 'Technical Support', userid: 2, date: day(-2) + ' 10:00:00', subject: 'Other client private ticket', status: 'Open', priority: 'Medium', lastreply: day(-2) + ' 10:00:00', replies: [{ replyid: 0, userid: 2, name: 'Other Person', date: day(-2) + ' 10:00:00', message: 'secret', admin: '' }] },
};
let nextTicket = 9000;
const departments = [{ id: 1, name: 'Technical Support' }, { id: 2, name: 'Billing' }, { id: 3, name: 'Sales' }];
const cid = (p, k = 'clientid') => Number(p[k] || 7);
const listInvoices = (uid) => Object.values(invoices).filter((i) => i.userid === uid);
const ticketSummary = (t) => ({ id: t.id, tid: t.tid, deptid: t.deptid, deptname: t.deptname, userid: t.userid, date: t.date, subject: t.subject, status: t.status, priority: t.priority, lastreply: t.lastreply });

const portal = {
  GetClients: (p) => {
    const q = String(p.search || '').toLowerCase();
    const list = Object.values(clients).filter((c) => !q || c.email.toLowerCase().includes(q) || `${c.firstname} ${c.lastname}`.toLowerCase().includes(q));
    return { totalresults: list.length, clients: { client: list.map((c) => ({ id: c.id, firstname: c.firstname, lastname: c.lastname, companyname: c.companyname, email: c.email, datecreated: c.datecreated || '2026-01-02', status: c.status })) } };
  },
  GetUsers: (p) => ({ totalresults: 0, users: [] }),
  GetClientsDetails: (p) => { const c = clients[cid(p)] || err('Client Not Found'); return { client: c, ...c, stats: { numactivetickets: 1 } }; },
  ValidateLogin: (p) => {
    const e = String(p.email || '').toLowerCase();
    if (!passwords[e] || passwords[e] !== p.password2) err('Email or Password Invalid');
    return { userid: { 'demo@example.com': 11, 'other@example.com': 12, 'tfa@example.com': 13 }[e], passwordhash: 'x', twoFactorEnabled: e === 'tfa@example.com' };
  },
  ResetPassword: () => ({ email: 'sent' }),
  GetClientsProducts: (p) => {
    let list = services[cid(p)] || [];
    if (p.serviceid) list = list.filter((s) => s.id === Number(p.serviceid));
    return { totalresults: list.length, products: { product: list } };
  },
  GetClientsDomains: (p) => {
    let list = domains[cid(p)] || [];
    if (p.domainid) list = list.filter((d) => d.id === Number(p.domainid));
    return { totalresults: list.length, domains: { domain: list.map(({ ns, ...d }) => d) } };
  },
  GetInvoices: (p) => {
    let list = listInvoices(Number(p.userid || 7));
    if (p.status) list = list.filter((i) => i.status === p.status);
    return { totalresults: list.length, invoices: { invoice: list.map(({ items, ...i }) => i) } };
  },
  GetInvoice: (p) => invoices[Number(p.invoiceid)] || err('Invoice ID Not Found'),
  GetTickets: (p) => {
    if (!p.clientid) return { tickets: { ticket: [] } };
    let list = Object.values(tickets).filter((t) => t.userid === Number(p.clientid));
    if (p.status === 'All Active Tickets') list = list.filter((t) => t.status !== 'Closed');
    else if (p.status) list = list.filter((t) => t.status === p.status);
    return { totalresults: list.length, tickets: { ticket: list.map(ticketSummary) } };
  },
  GetTicket: (p) => { const t = tickets[Number(p.ticketid)] || err('Ticket ID Not Found'); return { ...ticketSummary(t), ticketid: t.ticketid, replies: { reply: t.replies } }; },
  GetSupportDepartments: () => ({ totalresults: departments.length, departments: { department: departments } }),
  OpenTicket: (p) => {
    const id = nextTicket++, c = clients[Number(p.clientid)] || err('Client ID Not Found');
    const d = departments.find((x) => x.id === Number(p.deptid)) || err('Department ID not found');
    tickets[id] = { ticketid: id, id, tid: 'GHX-' + id, deptid: d.id, deptname: d.name, userid: c.id, date: now(), subject: p.subject, status: 'Open', priority: p.priority, lastreply: now(),
      replies: [{ replyid: 0, userid: c.id, name: `${c.firstname} ${c.lastname}`, date: now(), message: p.message, admin: '' }] };
    return { id, tid: 'GHX-' + id, c: 'x' };
  },
  AddTicketReply: (p) => {
    const t = tickets[Number(p.ticketid)] || err('Ticket ID Not Found');
    if (Number(p.clientid) !== t.userid) err('Client mismatch');
    const c = clients[t.userid];
    t.replies.push({ replyid: t.replies.length, userid: c.id, name: `${c.firstname} ${c.lastname}`, date: now(), message: p.message, admin: '' });
    t.status = 'Customer-Reply'; t.lastreply = now();
    return {};
  },
  DomainGetNameservers: (p) => {
    const d = Object.values(domains).flat().find((x) => x.id === Number(p.domainid)) || err('Domain ID Not Found');
    return Object.fromEntries(d.ns.map((n, i) => [`ns${i + 1}`, n]));
  },
  DomainUpdateNameservers: (p) => {
    const d = Object.values(domains).flat().find((x) => x.id === Number(p.domainid)) || err('Domain ID Not Found');
    const ns = [1, 2, 3, 4, 5].map((i) => p[`ns${i}`]).filter(Boolean);
    if (ns.some((n) => n.includes('reject'))) err('Registrar Error: Nameserver not registered');
    d.ns = ns;
    return {};
  },
  UpdateClient: (p) => {
    const c = clients[Number(p.clientid)] || err('Client ID Not Found');
    for (const k of ['firstname', 'lastname', 'companyname', 'phonenumber', 'address1', 'city', 'state', 'postcode', 'country']) if (p[k] !== undefined) c[k] = p[k];
    if (p.country) c.countrycode = p.country;
    return { clientid: c.id };
  },
  CreateSsoToken: (p) => ({ access_token: 'mock-token', redirect_url: `https://globalhostia.com/secure/oauth/singlesignon.php?access_token=mock-token&client=${p.client_id}&dest=${encodeURIComponent(p.destination)}${p.sso_redirect_path ? `&path=${encodeURIComponent(p.sso_redirect_path)}` : ''}${p.service_id ? `&service=${p.service_id}` : ''}${p.domain_id ? `&domain=${p.domain_id}` : ''}` }),
};

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
  GetPromotions: () => ({ promotions: { promotion: [{ id: 1, code: 'WELCOME10', type: 'Percentage', value: '10.00', uses: 4, maxuses: 0, expirationdate: '0000-00-00' }] } }),
  AddProduct: () => ({ pid: 999 }),
  ...portal,
};

http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const p = Object.fromEntries(new URLSearchParams(b));
    res.setHeader('content-type', 'application/json');
    if (p.identifier !== 'test' || p.secret !== 'test') return res.end(JSON.stringify({ result: 'error', message: 'Authentication Failed' }));
    const h = handlers[p.action];
    if (!h) return res.end(JSON.stringify({ result: 'error', message: `Unsupported action ${p.action}` }));
    try { res.end(JSON.stringify({ result: 'success', ...h(p) })); }
    catch (e) { res.end(JSON.stringify({ result: 'error', message: e.message })); }
  });
}).listen(4555, '127.0.0.1', () => console.log('mock WHMCS on :4555'));
