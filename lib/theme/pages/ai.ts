// AI / LLM hosting: streaming-tokens + utilisation hero (illustrative), models you can run, private-data value prop,
// memory sizing guide that lists REAL catalog servers with enough RAM, plans (ai-llm; may be empty), FAQ.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { money } from '../../pricing';
import { getCatalog, productsFor, minFrom, fromPrice, orderUrl, type TProduct } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, splitHead, planCards, plansNote, featureGrid, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, icon, link, fromText } from '../ui';
import { siteOf, gb, cores, specsOf, productsLd, crumbsFor } from './vps';

function stream() {
  const answer = 'Based on the three contracts you uploaded, the renewal notice period is 60 days for the supplier agreement and 30 days for both service contracts. The supplier agreement also requires written notice to the registered address.';
  return `<figure class="ai-vis" data-ai-vis>
  <div class="ai-vis__chat">
    <div class="ai-vis__bar"><span class="ai-dot" aria-hidden="true"></span><b>Private assistant</b><span class="ai-model">example: an 8B open model</span></div>
    <p class="ai-q"><span class="sr-only">Question: </span>What notice period do our supplier contracts require for renewal?</p>
    <p class="ai-a" data-ai-answer aria-label="Example answer: ${esc(answer)}"><span aria-hidden="true" data-text="${esc(answer)}">${esc(answer)}</span><i class="ai-caret" aria-hidden="true"></i></p>
    <div class="ai-vis__meta" aria-hidden="true"><span><b class="num" data-ai-tps>0</b> tokens/s</span><span><b class="num" data-ai-tok>0</b> tokens</span><span class="ai-local">${icon('lock')}Stays on your server</span></div>
  </div>
  <div class="ai-util" aria-hidden="true">
    <p>Compute utilisation</p>
    <div class="ai-util__bars">${Array.from({ length: 6 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
    <div class="ai-util__mem"><span>Model in memory</span><div><i></i></div></div>
  </div>
  <figcaption>Illustrative. Speed depends on the model, its quantisation and the server you run it on.</figcaption>
</figure>`;
}

const MODELS: { name: string; by: string; sizes: string; good: string }[] = [
  { name: 'Llama', by: 'Meta', sizes: '1B, 3B, 8B, 70B', good: 'General chat, summaries and agents' },
  { name: 'Mistral and Mixtral', by: 'Mistral AI', sizes: '7B, 8x7B, 24B', good: 'Fast assistants and European languages' },
  { name: 'Qwen', by: 'Alibaba', sizes: '0.5B to 72B', good: 'Multilingual work and coding' },
  { name: 'Gemma', by: 'Google', sizes: '2B, 9B, 27B', good: 'Compact models for focused tasks' },
  { name: 'Phi', by: 'Microsoft', sizes: '3.8B, 14B', good: 'Small models that reason well' },
  { name: 'DeepSeek R1 distills', by: 'DeepSeek', sizes: '1.5B to 70B', good: 'Step-by-step reasoning' },
  { name: 'Embedding models', by: 'Various', sizes: 'Under 1B', good: 'Search and retrieval over your documents' },
  { name: 'Whisper', by: 'OpenAI', sizes: 'Up to 1.5B', good: 'Speech to text, kept private' },
];

type Box = { name: string; slug: string; ram: number; cpu: string; price: string; href: string; eol: boolean };

function sizing(boxes: Box[]) {
  const params = [1, 3, 8, 14, 32, 70];
  const prec = [['4-bit', 0.5], ['8-bit', 1], ['16-bit', 2]] as const;
  const est = (p: number, b: number) => Math.ceil(p * b * 1.2 + 2);
  const p0 = 2, q0 = 0;
  return `<div class="ai-size" data-ai-size>
  <script type="application/json" data-boxes>${JSON.stringify(boxes).replace(/</g, '\\u003c')}</script>
  <div class="ai-size__ctrls">
    <div class="ai-ctl">
      <div class="ai-ctl__top"><label for="ai-p">Model size</label><output class="num" data-out-p>${params[p0]}B parameters</output></div>
      <input type="range" id="ai-p" min="0" max="${params.length - 1}" value="${p0}" data-params="${params.join(',')}" aria-valuetext="${params[p0]} billion parameters">
      <div class="ai-ctl__ticks num" aria-hidden="true">${params.map((p) => `<span>${p}B</span>`).join('')}</div>
    </div>
    <div class="ai-ctl"><span class="ai-ctl__lbl" id="ai-q-l">Precision (quantisation)</span>
      <div class="ai-prec" role="radiogroup" aria-labelledby="ai-q-l">${prec.map(([l, b], i) => `<button type="button" role="radio" aria-checked="${i === q0}" data-b="${b}"${i ? ' tabindex="-1"' : ''}><b>${l}</b><small>${i === 0 ? 'Smallest, most popular' : i === 1 ? 'Near-original quality' : 'Original weights'}</small></button>`).join('')}</div>
    </div>
    <p class="ai-size__how">Rule of thumb: parameters &times; bytes per parameter, plus about 20% and a little room for the conversation context. Leave extra memory for your application and operating system.</p>
  </div>
  <div class="ai-size__out" aria-live="polite">
    <p class="ai-size__k">Memory needed, roughly</p>
    <p class="ai-size__v num"><b data-ai-need>${est(params[p0], prec[q0][1])}</b> GB</p>
    <div class="ai-gauge" aria-hidden="true"><i data-ai-gauge style="--v:${Math.min(1, est(params[p0], prec[q0][1]) / 256).toFixed(3)}"></i></div>
    <p class="ai-size__fit" data-ai-fit>Servers in our catalog with enough memory, with headroom where possible:</p>
    <ul class="ai-boxes" data-ai-list>${(boxes.filter((b) => b.ram >= est(params[p0], prec[q0][1]) * 1.25).slice(0, 3)).map((b) => `<li><a href="/p/${esc(b.slug)}"><b>${esc(b.name)}</b><span class="num">${b.ram}GB RAM, ${esc(b.cpu)}</span></a><em class="num">${esc(b.price || 'See price')}</em></li>`).join('')}</ul>
    <p class="ai-size__note">Servers listed are from our current catalog and run models on CPU. For GPU servers, ask our team.</p>
  </div>
</div>`;
}

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const ps = productsFor(cat, ctx.route.categories);
  const from = minFrom(ps, currency);
  const crumbs = crumbsFor(ctx.route.title);
  // real servers that can hold a model in memory: dedicated + VPS, current models first, by price
  const pool: TProduct[] = productsFor(cat, ['dedicated-servers', 'premiumdedicated-servers', 'hostiavps']);
  const boxes: Box[] = pool.map((p) => {
    const s = specsOf(p), f = fromPrice(p, currency);
    const eol = /^(eol|out|sold ?out)$/i.test((p.badge || '').trim());
    const cpu = /vcpu/i.test(s.cpu || '') ? `${cores(s.cpu)} vCPU` : (p.tagline.split(/\s+[–-]\s+/)[0] || s.cpu || '');
    return { name: p.name, slug: p.slug, ram: gb(s.ram), cpu, price: f ? `${money(f.price, f.prefix)}${f.months > 1 ? '' : ' / month'}` : '', href: orderUrl(p, base), eol, per: f ? f.amount : 1e9 };
  }).filter((b) => b.ram > 0 && !b.eol).sort((a, b) => a.per - b.per || a.ram - b.ram).map(({ per: _p, ...b }) => b);

  const hero = pageHero({
    crumbs, eyebrow: 'Private AI and LLM hosting',
    title: 'Run open AI models on a server that only you control.',
    lead: 'Host Llama, Mistral, Qwen and other open models for chat, search and automation. Your prompts and documents stay on your own server instead of a third-party API.',
    ctas: [{ label: 'Size my server', href: '#sizing' }, { label: ps.length ? 'See AI plans' : 'Talk to our AI team', href: ps.length ? '#plans' : '/contact', variant: 'ghost' }],
    fromHtml: from ? `AI servers from <b class="num">${esc(fromText(ps.find((p) => minFrom([p], currency)?.amount === from.amount)!, currency))}</b>` : undefined,
    visualHtml: stream(),
  });

  const models = `<section class="hp-section" aria-labelledby="models-h"><div class="hp-container">
    ${splitHead({ id: 'models-h', title: 'Open models you can run', lead: 'Popular open-weight model families that run with tools such as Ollama, llama.cpp or vLLM. Check each model\u2019s licence for commercial use.' })}
    <ul class="ai-models" data-stagger>${MODELS.map((m, i) => `<li data-reveal style="--i:${i % 4}"><div class="ai-models__top"><h3>${esc(m.name)}</h3><span>${esc(m.by)}</span></div><p class="ai-models__sz num">${esc(m.sizes)}</p><p>${esc(m.good)}</p></li>`).join('')}</ul>
  </div></section>`;

  const privacy = `<section class="hp-section hp-section--dark hp-on-dark" aria-labelledby="priv-h"><div class="hp-container ai-priv">
    <div>
      <h2 id="priv-h" class="hp-hline hp-h2">Your data never leaves your server</h2>
      <p class="hp-lead">With a public AI API, every prompt and every document you send is processed on someone else\u2019s infrastructure. On your own server, the model, the data and the logs all live in one place you control.</p>
      <ul class="ai-priv__list">${[
        ['lock', 'Contracts, records and customer data stay in-house'],
        ['coin', 'No per-token bills: a fixed monthly server cost'],
        ['settings', 'Choose, fine-tune and swap models freely'],
        ['plug', 'Connect your own apps, n8n workflows and databases'],
      ].map(([ic, t]) => `<li>${icon(ic)}<span>${esc(t)}</span></li>`).join('')}</ul>
    </div>
    <figure class="ai-flowd" data-reveal aria-label="Diagram: with a public API your data crosses to an external provider; with private hosting the model, your documents and your apps sit together inside your server">
      <div class="ai-flowd__col is-them"><p>Public AI API</p><div class="ai-box">Your app</div><div class="ai-wire is-out"><span></span></div><div class="ai-box is-ext">Provider\u2019s servers<small>prompts, files, logs</small></div></div>
      <div class="ai-flowd__col is-us"><p>Your own server</p><div class="ai-fence"><div class="ai-box">Your app</div><div class="ai-wire"><span></span></div><div class="ai-box is-model">Open model<small>your documents, your logs</small></div></div></div>
    </figure>
  </div></section>`;

  const sizeSec = `<section class="hp-section hp-section--tint" id="sizing" aria-labelledby="sizing-h"><div class="hp-container">
    ${sectionHead({ id: 'sizing-h', title: 'How much memory does a model need?', lead: 'Pick a model size and precision. We estimate the memory it needs and list servers from our catalog that can hold it.' })}
    ${sizing(boxes)}
  </div></section>`;

  const plans = `<section class="hp-section" id="plans" aria-labelledby="plans-h"><div class="hp-container">
    ${sectionHead({ id: 'plans-h', title: 'AI hosting plans', lead: ps.length ? 'Servers prepared for running open models.' : 'Ready-made AI plans are on the way. Our team can prepare a server for your model today.' })}
    ${planCards(ps, { currency, base, id: 'ai-plans', orderLabel: 'Order AI server',
      emptyTitle: 'Tell us the model, we will prepare the server', emptyText: 'AI plans are not listed yet. Send us the model you want to run, the number of users and your data, and we will recommend a server and send you a quote.' })}
    ${plansNote(currency, link('Browse dedicated servers', '/dedicated-servers'))}
  </div></section>`;

  const features = `<section class="hp-section" aria-labelledby="feat-h"><div class="hp-container">
    ${sectionHead({ id: 'feat-h', title: 'What you get with private AI hosting' })}
    ${featureGrid([
      { icon: 'lock', title: 'Private by design', text: 'Prompts, documents and outputs are processed and stored on your server only.' },
      { icon: 'memory', title: 'Memory for real models', text: `Servers in our catalog go up to ${Math.max(0, ...boxes.map((b) => b.ram))}GB of RAM, enough for large quantised models.` },
      { icon: 'key', title: 'Full root access', text: 'Install Ollama, llama.cpp, vLLM, Open WebUI or your own stack.' },
      { icon: 'code', title: 'OpenAI-compatible APIs', text: 'Tools like Ollama and vLLM expose an API your existing code can call with a URL change.' },
      { icon: 'flow', title: 'Plug into automation', text: 'Connect models to n8n workflows, internal tools and databases on the same server.' },
      { icon: 'coin', title: 'Predictable cost', text: 'A monthly server price instead of a bill that grows with every token.' },
      { icon: 'database', title: 'Search your own documents', text: 'Run embeddings and a vector database next to the model for retrieval over your files.' },
      { icon: 'headset', title: 'Engineers on call', text: 'Help choosing a model and server size, by phone, email, WhatsApp and ticket, around the clock.' },
    ], { cols: 4 })}
  </div></section>`;

  const faqs = [
    { q: 'Which models can I run?', a: 'Any open-weight model your server has the memory for, including Llama, Mistral, Qwen, Gemma, Phi and DeepSeek distills, as well as embedding and speech models. Check each model\u2019s licence before commercial use.' },
    { q: 'Do I need a GPU?', a: 'Not always. Small and medium quantised models run on CPU servers with enough memory, which suits private assistants, document search and batch jobs. Answers come more slowly than on a GPU. For real-time use with large models or many users, ask our team about GPU options.' },
    { q: 'How much RAM do I need?', a: 'Roughly the number of parameters times the bytes per parameter, plus about 20% overhead and room for context. An 8B model at 4-bit needs around 7GB, while a 70B model at 4-bit needs around 45GB. Use the sizing guide above and leave headroom for your application.' },
    { q: 'Is my data used to train anyone\u2019s model?', a: 'No. The model runs on your server, and your prompts and documents are not sent to an AI provider. What you store and log on the server is under your control.' },
    { q: 'Can you set up the model for me?', a: 'Yes. Tell us the model and how you plan to use it, and our engineers can help install a runtime such as Ollama with a web interface or an API endpoint.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="faq-h"><div class="hp-container ai-faq">
    ${sectionHead({ id: 'faq-h', title: 'AI hosting questions', align: 'left', lead: 'Planning something specific? Our team can size a server with you.' })}
    ${faq(faqs, { id: 'ai-faq' })}
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: 'Bring your AI in-house', text: 'Tell us the model you want to run and we will recommend a server sized for it.',
    primary: { label: 'Talk to our AI team', href: '/contact' }, secondary: { label: 'Size my server', href: '#sizing' } });

  return page({
    ctx, catalog: cat, path: ctx.path, title: ctx.route.title, description: ctx.route.description, css: ['ai'], js: ['ai'],
    jsonLd: [breadcrumbJsonLd(crumbs, siteOf(cat)), faqJsonLd(faqs), productsLd(ps, cat, 'AI hosting plans')].filter(Boolean),
    body: [hero, models, privacy, sizeSec, plans, features, faqSec, cta].join('\n'),
  });
}
