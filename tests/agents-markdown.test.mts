import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToMarkdown, wantsMarkdown, mdPath } from '../lib/agents/markdown.ts';

test('wantsMarkdown honours q-values', () => {
  assert.equal(wantsMarkdown('text/markdown'), true);
  assert.equal(wantsMarkdown('text/markdown, text/html;q=0.9'), true);
  assert.equal(wantsMarkdown('text/html,application/xhtml+xml,*/*;q=0.8'), false);
  assert.equal(wantsMarkdown('text/html, text/markdown;q=0.5'), false);
  assert.equal(wantsMarkdown(null), false);
});

test('mdPath', () => {
  assert.equal(mdPath('/'), '/index.md');
  assert.equal(mdPath('/web-hosting/'), '/web-hosting.md');
  assert.equal(mdPath('/p/x'), '/p/x.md');
});

test('htmlToMarkdown keeps main content and drops decoration', () => {
  const html = `<header>nav</header><main><h1>Plans</h1><p>Fast &amp; <strong>cheap</strong>.</p><svg><text>x</text></svg>
    <span aria-hidden="true"><i>icon</i></span><ul><li><a href="/p/a">Plan A</a></li><li>Plan B</li></ul>
    <table><tr><th>Cycle</th><th>Price</th></tr><tr><td>Monthly</td><td>2.99</td></tr></table><script>alert(1)</script><form><input name=a><button>Go</button></form></main>`;
  const md = htmlToMarkdown(html, 'https://globalhostia.com');
  assert.match(md, /^# Plans/);
  assert.match(md, /Fast & \*\*cheap\*\*\./);
  assert.match(md, /- \[Plan A\]\(https:\/\/globalhostia\.com\/p\/a\)/);
  assert.match(md, /\| Cycle \| Price \|\n\| --- \| --- \|\n\| Monthly \| 2\.99 \|/);
  assert.doesNotMatch(md, /alert|icon|nav|Go\b/);
});
