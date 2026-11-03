/* WebMCP: shopping tools for AI agents running in the visitor's browser (Chrome origin trial, document.modelContext;
   navigator.modelContext on older builds). Loaded only when the API exists (see lib/theme/shell.ts). Each tool calls
   the public read-only MCP endpoint, so answers match /api/mcp exactly: live prices, never invented. */
(function () {
  var mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.registerTool !== 'function' || window.__ghWebMcp) return;
  window.__ghWebMcp = true;
  var cur = (document.cookie.match(/(?:^|;\s*)gh_cur=([A-Z]{3})/) || [])[1];

  function call(name, args, signal) {
    var a = Object.assign({}, args || {});
    if (cur && !a.currency && name !== 'get_policies') a.currency = cur;
    return fetch('/api/mcp', {
      method: 'POST', signal: signal,
      headers: { 'content-type': 'application/json', accept: 'application/json', 'mcp-protocol-version': '2025-11-25' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: name, arguments: a } })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) return 'Error: ' + j.error.message;
      var c = j.result && j.result.content && j.result.content[0];
      return c && c.text ? c.text : JSON.stringify(j.result);
    });
  }

  var CUR = { type: 'string', pattern: '^[A-Za-z]{3}$', description: 'ISO currency code (default: the currency shown on the page).' };
  var tools = [
    { name: 'search_plans', description: 'Search GlobalHostia hosting, VPS, dedicated server, SSL and email plans by keywords, with optional category, location and maximum monthly price. Returns live prices and cart links.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'e.g. "windows vps 8gb"' }, location: { type: 'string' }, max_price: { type: 'number', minimum: 0 }, currency: CUR } },
      mcp: 'search_products' },
    { name: 'recommend_plan', description: 'Recommend up to 3 GlobalHostia plans for a need described in words (e.g. "WordPress blog", "MT5 forex VPS under 20 USD"), with live prices, reasons and cart links.',
      inputSchema: { type: 'object', required: ['need'], properties: { need: { type: 'string' }, budget_monthly: { type: 'number', minimum: 0 }, location: { type: 'string' }, os: { type: 'string' }, currency: CUR } },
      mcp: 'recommend_plan' },
    { name: 'check_domain', description: 'Check if a domain name is available at GlobalHostia, with the first-year and renewal price and an add-to-cart link.',
      inputSchema: { type: 'object', required: ['domain'], properties: { domain: { type: 'string', description: 'e.g. mybrand.com' }, currency: CUR } },
      mcp: 'check_domain' },
    { name: 'build_cart_link', description: 'Get a GlobalHostia cart link for a plan slug with the billing cycle and currency preselected (optionally with a domain). The user completes checkout.',
      inputSchema: { type: 'object', required: ['slug'], properties: { slug: { type: 'string' }, billing_cycle: { type: 'string', enum: ['monthly', 'quarterly', 'semiannually', 'annually', 'biennially', 'triennially'] }, domain: { type: 'string' }, currency: CUR } },
      mcp: 'build_cart_link' },
    { name: 'get_policies', description: 'GlobalHostia refund, VAT/tax, renewal and cancellation policies from the published terms.',
      inputSchema: { type: 'object', properties: { topic: { type: 'string', enum: ['all', 'refunds', 'renewal', 'taxes', 'cancellation', 'domains'] } } },
      mcp: 'get_policies' }
  ];
  tools.forEach(function (t) {
    try {
      var p = mc.registerTool({
        name: t.name, description: t.description, inputSchema: t.inputSchema,
        annotations: { readOnlyHint: true },
        execute: function (args, opts) { return call(t.mcp, args, opts && opts.signal); }
      });
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) { /* tool already registered or API shape changed: ignore */ }
  });
})();
