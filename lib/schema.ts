// GlobalHostia platform DB (content & presentation). WHMCS stays authoritative
// for billing, provisioning, orders and customers.
import { pgTable, text, integer, boolean, timestamp, jsonb, numeric, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { createId } from './id';

const id = () => text('id').primaryKey().$defaultFn(createId);
const now = (n: string) => timestamp(n, { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum('role', ['OWNER', 'ADMIN', 'EDITOR']);
export const statusEnum = pgEnum('status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);

export const adminUsers = pgTable('admin_users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default(''),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('EDITOR'),
  active: boolean('active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: now('created_at'),
});

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  userEmail: text('user_email').notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  detail: jsonb('detail'),
  createdAt: now('created_at'),
}, (t) => [index('audit_created_idx').on(t.createdAt)]);

export const revisions = pgTable('revisions', {
  id: id(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  data: jsonb('data').notNull(),
  userEmail: text('user_email').notNull(),
  createdAt: now('created_at'),
}, (t) => [index('rev_entity_idx').on(t.entity, t.entityId)]);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

export const categories = pgTable('categories', {
  id: id(),
  parentId: text('parent_id'),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  layout: text('layout').notNull().default('auto'), // auto|featured|cards|grid|catalog
  cardTemplate: text('card_template').notNull().default('plan-card'),
  sortOrder: integer('sort_order').notNull().default(0),
  visible: boolean('visible').notNull().default(true),
  whmcsGroupId: integer('whmcs_group_id'),
  seoTitle: text('seo_title').notNull().default(''),
  seoDescription: text('seo_description').notNull().default(''),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
});

export type ConfigOptionChoice = { id: number; name: string; pricing: Record<string, Record<string, number>>; setup: Record<string, Record<string, number>> };
export type ConfigOption = { id: number; name: string; type: 'select' | 'radio' | 'yesno' | 'quantity'; min?: number; max?: number; options: ConfigOptionChoice[] };
export const products = pgTable('products', {
  id: id(),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  tagline: text('tagline').notNull().default(''),
  description: text('description').notNull().default(''),
  features: jsonb('features').$type<string[]>().notNull().default([]), // "-" prefix = not included
  attributes: jsonb('attributes').$type<Record<string, string>>().notNull().default({}),
  // WHMCS configurable options (OS, extra RAM/vCPU/disk…) with per-cycle prices, mirrored by sync
  configOptions: jsonb('config_options').$type<ConfigOption[]>().notNull().default([]),
  badge: text('badge').notNull().default(''),
  badgeColor: text('badge_color').notNull().default('primary'),
  featured: boolean('featured').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  status: statusEnum('status').notNull().default('DRAFT'),
  displayCycle: text('display_cycle').notNull().default('auto'),
  orderUrl: text('order_url').notNull().default(''),
  publishAt: timestamp('publish_at', { withTimezone: true }),
  contentLocked: boolean('content_locked').notNull().default(false), // admin edited → sync won't overwrite text
  whmcsPid: integer('whmcs_pid').unique(),
  whmcsGid: integer('whmcs_gid'),
  whmcsName: text('whmcs_name').notNull().default(''),
  whmcsType: text('whmcs_type').notNull().default(''),
  whmcsHidden: boolean('whmcs_hidden').notNull().default(false),
  whmcsRetired: boolean('whmcs_retired').notNull().default(false),
  whmcsUrl: text('whmcs_url').notNull().default(''),
  payType: text('pay_type').notNull().default(''),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  syncError: text('sync_error').notNull().default(''),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [index('products_cat_idx').on(t.categoryId, t.status)]);

export const productPrices = pgTable('product_prices', {
  id: id(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  currency: text('currency').notNull(),
  prefix: text('prefix').notNull().default(''),
  suffix: text('suffix').notNull().default(''),
  cycle: text('cycle').notNull(),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  setupFee: numeric('setup_fee', { precision: 12, scale: 2 }).notNull().default('0'),
}, (t) => [uniqueIndex('price_uniq').on(t.productId, t.currency, t.cycle)]);

export const tlds = pgTable('tlds', {
  id: id(),
  tld: text('tld').notNull().unique(),
  currency: text('currency').notNull().default('USD'),
  register: numeric('register', { precision: 12, scale: 2 }),
  transfer: numeric('transfer', { precision: 12, scale: 2 }),
  renew: numeric('renew', { precision: 12, scale: 2 }),
  featured: boolean('featured').notNull().default(false),
  visible: boolean('visible').notNull().default(true),
  promo: text('promo').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(100),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
});

// Extra currencies for TLD prices (tlds holds the default currency + admin flags).
export const tldPrices = pgTable('tld_prices', {
  tld: text('tld').notNull(),
  currency: text('currency').notNull(),
  register: numeric('register', { precision: 12, scale: 2 }),
  transfer: numeric('transfer', { precision: 12, scale: 2 }),
  renew: numeric('renew', { precision: 12, scale: 2 }),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
}, (t) => [uniqueIndex('tld_prices_tld_cur').on(t.tld, t.currency)]);

// Support notifier: the last ticket activity the owner was already emailed about (lib/support-notify.ts).
export const ticketNotify = pgTable('ticket_notify', {
  ticketId: integer('ticket_id').primaryKey(),
  tid: text('tid').notNull().default(''),
  lastReply: text('last_reply').notNull(),
  status: text('status').notNull().default(''),
  notifiedAt: now('notified_at'),
});


export const blocks = pgTable('blocks', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  html: text('html').notNull().default(''),
  updatedAt: now('updated_at'),
});

export const pages = pgTable('pages', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  seoTitle: text('seo_title').notNull().default(''),
  seoDescription: text('seo_description').notNull().default(''),
  seoKeywords: text('seo_keywords').notNull().default(''),
  ogImage: text('og_image').notNull().default(''),
  status: statusEnum('status').notNull().default('PUBLISHED'),
  publishAt: timestamp('publish_at', { withTimezone: true }),
  bodyClass: text('body_class').notNull().default(''),
  wrapperClass: text('wrapper_class').notNull().default('site-wrapper overflow-hidden'),
  headExtra: text('head_extra').notNull().default(''),
  headBlock: text('head_block').notNull().default('head'),
  bodyStartBlock: text('body_start_block').notNull().default('body_start'),
  headerBlock: text('header_block').notNull().default('header'),
  footerBlock: text('footer_block').notNull().default('footer'),
  bodyEndBlock: text('body_end_block').notNull().default('body_end'),
  inSitemap: boolean('in_sitemap').notNull().default(true),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
});

export const sections = pgTable('sections', {
  id: id(),
  pageId: text('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // html|products|domain_search|domain_results|tld_pricing|faq
  name: text('name').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  visible: boolean('visible').notNull().default(true),
  html: text('html').notNull().default(''),
  data: jsonb('data').$type<Record<string, any>>().notNull().default({}),
}, (t) => [index('sections_page_idx').on(t.pageId, t.sortOrder)]);

export const redirects = pgTable('redirects', {
  id: id(),
  from: text('from').notNull().unique(),
  to: text('to').notNull(),
  code: integer('code').notNull().default(301),
  createdAt: now('created_at'),
});

export const syncRuns = pgTable('sync_runs', {
  id: id(),
  kind: text('kind').notNull(),
  trigger: text('trigger').notNull().default('manual'),
  status: text('status').notNull().default('running'),
  startedAt: now('started_at'),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  stats: jsonb('stats').notNull().default({}),
  error: text('error').notNull().default(''),
});

export const apiLogs = pgTable('api_logs', {
  id: id(),
  action: text('action').notNull(),
  ok: boolean('ok').notNull(),
  ms: integer('ms').notNull(),
  error: text('error').notNull().default(''),
  createdAt: now('created_at'),
}, (t) => [index('apilog_created_idx').on(t.createdAt)]);

// Backups of WHMCS email settings (EmailCSS / EmailGlobalHeader / EmailGlobalFooter / brand settings),
// taken before /admin/emails changes them, so "Restore previous" can put them back.
export const emailDesignBackups = pgTable('email_design_backups', {
  id: id(),
  values: jsonb('values').notNull().$type<Record<string, string>>(),
  note: text('note').notNull().default(''),
  userEmail: text('user_email').notNull(),
  createdAt: now('created_at'),
  restoredAt: timestamp('restored_at', { withTimezone: true }),
}, (t) => [index('email_backup_created_idx').on(t.createdAt)]);

// Blog / SEO articles (Markdown body). Visible when PUBLISHED and publishAt is null or in the past.
export const posts = pgTable('posts', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  excerpt: text('excerpt').notNull().default(''),
  body: text('body').notNull().default(''),
  coverImage: text('cover_image').notNull().default(''),
  coverAlt: text('cover_alt').notNull().default(''),
  category: text('category').notNull().default(''),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  author: text('author').notNull().default(''),
  status: statusEnum('status').notNull().default('DRAFT'),
  publishAt: timestamp('publish_at', { withTimezone: true }),
  featured: boolean('featured').notNull().default(false),
  seoTitle: text('seo_title').notNull().default(''),
  seoDescription: text('seo_description').notNull().default(''),
  ogImage: text('og_image').notNull().default(''),
  canonical: text('canonical').notNull().default(''),
  coverStyle: text('cover_style').notNull().default('branded'), // branded | plain | hex
  takeaways: text('takeaways').notNull().default(''), // one per line
  focusKeyword: text('focus_keyword').notNull().default(''),
  secondaryKeywords: text('secondary_keywords').notNull().default(''), // comma separated
  relatedProducts: jsonb('related_products').$type<string[]>().notNull().default([]), // "cat:<slug>" | "p:<slug>"
  // content engine (lib/content/*, db-setup patch '031-content-engine'): article language, guide collection, and the
  // English post an Arabic version translates (hreflang pair)
  lang: text('lang').notNull().default('en'), // en | ar
  track: text('track').notNull().default(''), // '' | uae | global
  translationOf: text('translation_of'),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [index('posts_status_publish_idx').on(t.status, t.publishAt)]);

export type Product = typeof products.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Tld = typeof tlds.$inferSelect;

// Leads (Admin → Marketing → Leads): email / WhatsApp sign-ups from the footer, pop-ups, plan finder and ad landing pages.
// Stored only; nothing is emailed automatically. ip_hash is a salted SHA-256 prefix (never the raw IP).
export const leads = pgTable('leads', {
  id: id(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  phone: text('phone').notNull().default(''), // WhatsApp / phone, "+<digits>"
  source: text('source').notNull().default(''), // popup | footer | plan-finder | landing:<slug>
  page: text('page').notNull().default(''),
  utmSource: text('utm_source').notNull().default(''),
  utmMedium: text('utm_medium').notNull().default(''),
  utmCampaign: text('utm_campaign').notNull().default(''),
  utmTerm: text('utm_term').notNull().default(''),
  utmContent: text('utm_content').notNull().default(''),
  country: text('country').notNull().default(''),
  interest: text('interest').notNull().default(''),
  consent: boolean('consent').notNull().default(false),
  ipHash: text('ip_hash').notNull().default(''),
  status: text('status').notNull().default('new'), // new | contacted | won | lost
  notes: text('notes').notNull().default(''),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [index('leads_email_created_idx').on(t.email, t.createdAt), index('leads_created_idx').on(t.createdAt), index('leads_ip_created_idx').on(t.ipHash, t.createdAt)]);

// Ad landing pages at /lp/<slug> (Admin → Marketing → Landing pages). target: "cat:<slug>" | "p:<slug>" | "tld:.ae".
export const landingPages = pgTable('landing_pages', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull().default(''),
  headline: text('headline').notNull().default(''),
  subheadline: text('subheadline').notNull().default(''),
  target: text('target').notNull().default(''),
  productSlug: text('product_slug').notNull().default(''), // optional: pin one plan of a category target
  benefits: jsonb('benefits').$type<string[]>().notNull().default([]),
  faq: jsonb('faq').$type<{ q: string; a: string }[]>().notNull().default([]),
  ctaLabel: text('cta_label').notNull().default(''),
  showLeadForm: boolean('show_lead_form').notNull().default(true),
  showTrust: boolean('show_trust').notNull().default(true),
  noindex: boolean('noindex').notNull().default(true),
  status: statusEnum('status').notNull().default('DRAFT'),
  seoTitle: text('seo_title').notNull().default(''),
  seoDescription: text('seo_description').notNull().default(''),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
});

export type Lead = typeof leads.$inferSelect;
export type LandingPage = typeof landingPages.$inferSelect;

// Domain Broker Service requests (/domain-broker → /api/broker-request). Created by db-setup patch '018-broker'.
export const brokerRequests = pgTable('broker_requests', {
  id: id(),
  ref: text('ref').notNull().unique(),
  domain: text('domain').notNull(),
  budgetMin: numeric('budget_min', { precision: 14, scale: 2 }),
  budgetMax: numeric('budget_max', { precision: 14, scale: 2 }),
  currency: text('currency').notNull().default('USD'),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull().default(''),
  notes: text('notes').notNull().default(''),
  use: text('use').notNull().default(''),
  status: text('status').notNull().default('new'),
  assigned: text('assigned').notNull().default(''),
  ownerContactedAt: timestamp('owner_contacted_at', { withTimezone: true }),
  agreedPrice: numeric('agreed_price', { precision: 14, scale: 2 }),
  commission: numeric('commission', { precision: 14, scale: 2 }),
  outcomeNotes: text('outcome_notes').notNull().default(''),
  ticketId: text('ticket_id').notNull().default(''),
  ticketNum: text('ticket_num').notNull().default(''),
  utmSource: text('utm_source').notNull().default(''),
  utmMedium: text('utm_medium').notNull().default(''),
  utmCampaign: text('utm_campaign').notNull().default(''),
  referrer: text('referrer').notNull().default(''),
  ipHash: text('ip_hash').notNull().default(''),
  // 'broker' (taken domain, /domain-broker) or 'premium' (purchase request from /premium-domains; listing = what was shown)
  kind: text('kind').notNull().default('broker'),
  listing: jsonb('listing'),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [index('broker_status_idx').on(t.status, t.createdAt)]);
export type BrokerRequest = typeof brokerRequests.$inferSelect;

// Premium domains marketplace (lib/premium/*, Admin → Premium domains). Created by db-setup patch '036-premium-domains'.
// premium_domains: the owner's own listings (owned or brokered). premium_feed: cached Dynadot marketplace listings
// (refreshed by the daily cron / "Refresh now"; base Dynadot price in USD, the public price applies the admin rule).
export const premiumDomains = pgTable('premium_domains', {
  id: id(),
  domain: text('domain').notNull().unique(),
  price: numeric('price', { precision: 14, scale: 2 }),
  currency: text('currency').notNull().default('USD'),
  makeOffer: boolean('make_offer').notNull().default(false),
  minOffer: numeric('min_offer', { precision: 14, scale: 2 }),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('draft'), // draft | for_sale | under_offer | sold
  owned: boolean('owned').notNull().default(true), // false = brokered for a third party
  featured: boolean('featured').notNull().default(false),
  soldAt: timestamp('sold_at', { withTimezone: true }),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [index('premium_domains_status_idx').on(t.status)]);
export type PremiumDomain = typeof premiumDomains.$inferSelect;
export const premiumFeed = pgTable('premium_feed', {
  domain: text('domain').primaryKey(),
  listingId: text('listing_id').notNull().default(''),
  price: numeric('price', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  fetchedAt: now('fetched_at'),
});

// Portal DNS editor: zones we created on the DNS-only DirectAdmin account for domain-only customers
// (lib/portal/dns.ts). Only `client_id` may edit the zone; admin can remove it (Admin → Hosting panels).
// Created by db-setup patch '021-dns-zones'.
export const dnsZones = pgTable('dns_zones', {
  id: id(),
  domain: text('domain').notNull().unique(),
  whmcsDomainId: integer('whmcs_domain_id'),
  clientId: integer('client_id').notNull(),
  serverId: text('server_id').notNull(),
  daUser: text('da_user').notNull(),
  createdAt: now('created_at'),
}, (t) => [index('dns_zones_client_idx').on(t.clientId)]);
export type DnsZone = typeof dnsZones.$inferSelect;

// AI assistant (lib/ai/*): one row per assistant request (model calls summed) or gate decision, for cost, budget caps,
// rate limits and the usage dashboard. No message text is stored. subject = hashed IP, client#<id>, admin email or ticket#<id>.
// status: ok | error | offtopic | blocked | greeting | limited | budget | offline. Created by db-setup patch '030-ai'.
export const aiUsage = pgTable('ai_usage', {
  id: id(),
  surface: text('surface').notNull(), // chat | assist | tickets | admin | gate | names
  model: text('model').notNull().default(''),
  subject: text('subject').notNull().default(''),
  status: text('status').notNull().default('ok'),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheRead: integer('cache_read').notNull().default(0),
  cacheWrite: integer('cache_write').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
  ms: integer('ms').notNull().default(0),
  tools: jsonb('tools').$type<string[]>().notNull().default([]),
  detail: text('detail').notNull().default(''),
  createdAt: now('created_at'),
}, (t) => [index('ai_usage_created_idx').on(t.createdAt), index('ai_usage_subject_idx').on(t.subject, t.createdAt)]);

// Support ticket automation (lib/ai/tickets.ts): one row per ticket activity (ticket id + last reply stamp) the assistant
// looked at, with the classification, decision and draft. Created by db-setup patch '030-ai'.
export const aiTicketRuns = pgTable('ai_ticket_runs', {
  id: id(),
  ticketId: integer('ticket_id').notNull(),
  tid: text('tid').notNull().default(''),
  activity: text('activity').notNull(),
  state: text('state').notNull().default('pending'), // pending | auto_sent | drafted | sent | skipped | error
  category: text('category').notNull().default(''),
  sentiment: text('sentiment').notNull().default(''),
  urgency: text('urgency').notNull().default(''),
  language: text('language').notNull().default(''),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  summary: text('summary').notNull().default(''),
  reasons: jsonb('reasons').$type<string[]>().notNull().default([]),
  draft: text('draft').notNull().default(''),
  sentBy: text('sent_by').notNull().default(''),
  error: text('error').notNull().default(''),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [uniqueIndex('ai_ticket_runs_activity').on(t.ticketId, t.activity), index('ai_ticket_runs_created_idx').on(t.createdAt)]);
export type AiTicketRun = typeof aiTicketRuns.$inferSelect;

// Portal web push (lib/portal/push.ts): one row per browser/device subscription, owned by a WHMCS client. Categories
// the customer turned on (tickets, invoices, domains, services). Created by db-setup patch '022-portal-push'.
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: id(),
  clientId: integer('client_id').notNull(),
  userId: integer('user_id'),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  categories: jsonb('categories').notNull().default(['tickets', 'invoices', 'domains', 'services']),
  lang: text('lang').notNull().default('en'),
  ua: text('ua').notNull().default(''),
  failCount: integer('fail_count').notNull().default(0),
  lastOkAt: timestamp('last_ok_at', { withTimezone: true }),
  createdAt: now('created_at'),
}, (t) => [index('push_sub_client_idx').on(t.clientId)]);
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

// One row per notification already sent (dedupe key like "inv:5001:overdue"), so the scanner never repeats itself.
export const pushLog = pgTable('push_log', {
  key: text('key').primaryKey(),
  clientId: integer('client_id').notNull(),
  sentAt: now('sent_at'),
}, (t) => [index('push_log_sent_idx').on(t.sentAt)]);

// SEO content engine (Admin → Marketing & SEO → Content engine, lib/content/*): topic ideas, their calendar slot and the
// blog posts drafted from them. The article itself is a normal `posts` row (DRAFT until the owner approves it).
// state: idea | approved | drafting | draft_ready | in_review | scheduled | published | rejected. Created by db-setup patch '031-content-engine'.
export const contentIdeas = pgTable('content_ideas', {
  id: id(),
  track: text('track').notNull().default('global'), // uae | global
  title: text('title').notNull(),
  primaryKeyword: text('primary_keyword').notNull().default(''),
  secondaryKeywords: jsonb('secondary_keywords').$type<string[]>().notNull().default([]),
  intent: text('intent').notNull().default('informational'), // informational | commercial | transactional
  country: text('country').notNull().default(''), // audience: AE, SA, GCC, Global…
  target: text('target').notNull().default(''), // cat:<slug> | p:<slug> | /path (product/category the article links to)
  slug: text('slug').notNull().default(''),
  priority: integer('priority').notNull().default(50), // 0-100
  rationale: text('rationale').notNull().default(''),
  overlap: text('overlap').notNull().default(''), // possible overlap with an existing page (cannibalization warning)
  source: text('source').notNull().default('ai'), // seed | ai | owner
  state: text('state').notNull().default('idea'),
  plannedFor: timestamp('planned_for', { withTimezone: true }), // calendar slot (publish date/time)
  postId: text('post_id'),
  arPostId: text('ar_post_id'),
  wantArabic: boolean('want_arabic').notNull().default(false),
  checks: jsonb('checks').$type<{ id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }[]>().notNull().default([]),
  checkedAt: timestamp('checked_at', { withTimezone: true }),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
  error: text('error').notNull().default(''),
  approvedBy: text('approved_by').notNull().default(''),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [index('content_ideas_state_idx').on(t.state, t.plannedFor), index('content_ideas_post_idx').on(t.postId)]);
export type ContentIdea = typeof contentIdeas.$inferSelect;

// AI connector (Claude / ChatGPT) OAuth 2.1 authorization server (lib/oauth/*). Tokens and codes are stored only as
// SHA-256 hashes. A grant is one customer consent for one client; codes and tokens hang off it, so revoking the grant
// (Account → Connected apps, Admin → AI connectors) kills every token at once. Created by db-setup patch '032-oauth'.
export const oauthClients = pgTable('oauth_clients', {
  id: text('id').primaryKey(), // client_id: random for DCR, the https URL for a Client ID Metadata Document
  kind: text('kind').notNull(), // dcr | cimd
  name: text('name').notNull().default(''),
  redirectUris: jsonb('redirect_uris').$type<string[]>().notNull().default([]),
  platform: text('platform').notNull().default('other'), // claude | chatgpt | inspector | other
  flagged: boolean('flagged').notNull().default(false), // redirect URI outside the known assistants and loopback
  authMethod: text('auth_method').notNull().default('none'), // space-separated, preferred first (e.g. "private_key_jwt none")
  secretHash: text('secret_hash'),
  jwks: jsonb('jwks').$type<{ keys: Record<string, unknown>[] }>(), // private_key_jwt: inline JWK Set (patch 034)
  jwksUri: text('jwks_uri'), // private_key_jwt: JWK Set URL (patch 034)
  clientUri: text('client_uri'),
  logoUri: text('logo_uri'),
  disabled: boolean('disabled').notNull().default(false),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }), // CIMD: last successful fetch
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: now('created_at'),
});
export type OauthClient = typeof oauthClients.$inferSelect;

export const oauthGrants = pgTable('oauth_grants', {
  id: id(),
  clientId: text('client_id').notNull(),
  whmcsClientId: integer('whmcs_client_id').notNull(),
  userEmail: text('user_email').notNull().default(''),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  resource: text('resource').notNull(),
  createdAt: now('created_at'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: text('revoked_by').notNull().default(''),
}, (t) => [index('oauth_grants_client_idx').on(t.whmcsClientId), index('oauth_grants_app_idx').on(t.clientId)]);
export type OauthGrant = typeof oauthGrants.$inferSelect;

/** private_key_jwt replay protection: one row per accepted client assertion (jti) until it expires. Patch '034-oauth-private-key-jwt'. */
export const oauthAssertions = pgTable('oauth_assertions', {
  key: text('key').primaryKey(),
  clientId: text('client_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const oauthCodes = pgTable('oauth_codes', {
  hash: text('hash').primaryKey(),
  grantId: text('grant_id').notNull(),
  clientId: text('client_id').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

export const oauthTokens = pgTable('oauth_tokens', {
  hash: text('hash').primaryKey(),
  kind: text('kind').notNull(), // access | refresh
  grantId: text('grant_id').notNull(),
  clientId: text('client_id').notNull(),
  whmcsClientId: integer('whmcs_client_id').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  resource: text('resource').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }), // refresh: rotated (a second use revokes the grant)
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: now('created_at'),
}, (t) => [index('oauth_tokens_grant_idx').on(t.grantId), index('oauth_tokens_exp_idx').on(t.expiresAt)]);

// Abandoned-cart and renewal reminders (lib/reminders/*, Admin → Business → Reminders). Created by db-setup patch '035-reminders'.
// Customer choices: one row per WHMCS client (client_id) or per guest email (client_id null). WhatsApp only after an
// explicit opt-in (time + source kept as the consent record). unsubscribed_* = stopped from an email link.
export const reminderPrefs = pgTable('reminder_prefs', {
  id: id(),
  clientId: integer('client_id').unique(),
  email: text('email').notNull().default(''),
  cartEmail: boolean('cart_email').notNull().default(true),
  renewalEmail: boolean('renewal_email').notNull().default(true),
  whatsapp: boolean('whatsapp').notNull().default(false),
  whatsappAt: timestamp('whatsapp_at', { withTimezone: true }),
  whatsappSource: text('whatsapp_source').notNull().default(''),
  updatedAt: now('updated_at'),
}, (t) => [index('reminder_prefs_email_idx').on(t.email)]);

// Email addresses that unsubscribed from a link (scope cart | renewal | all). Checked before every send, clients and guests alike.
export const reminderSuppress = pgTable('reminder_suppress', {
  email: text('email').notNull(),
  scope: text('scope').notNull(),
  source: text('source').notNull().default('link'),
  createdAt: now('created_at'),
}, (t) => [uniqueIndex('reminder_suppress_uniq').on(t.email, t.scope)]);

// Carts captured from the WHMCS client area (signed snapshot from the WHMCS hook; no prices, card data or passwords).
// cart_key: "c:<clientid>" or "g:<session hash>"; one open cart per key. status: open | ordered | emptied | expired | stopped.
export const reminderCarts = pgTable('reminder_carts', {
  id: id(),
  cartKey: text('cart_key').notNull().unique(),
  clientId: integer('client_id'),
  email: text('email').notNull().default(''),
  consent: text('consent').notNull().default(''),
  currencyId: integer('currency_id').notNull().default(0),
  items: jsonb('items').notNull().default({}),
  fingerprint: text('fingerprint').notNull().default(''),
  status: text('status').notNull().default('open'),
  whatsappOptIn: boolean('whatsapp_opt_in').notNull().default(false),
  restoreClicks: integer('restore_clicks').notNull().default(0),
  orderId: integer('order_id'),
  createdAt: now('created_at'),
  activityAt: now('activity_at'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (t) => [index('reminder_carts_status_idx').on(t.status, t.activityAt), index('reminder_carts_client_idx').on(t.clientId)]);

// One row per reminder (kind, item, stage, channel, cycle) — the unique index makes every send idempotent.
// item: "cart:<id>" / "svc:<id>" / "dom:<id>" / "inv:<id>"; cycle: the due / expiry date (a new billing cycle gets new
// reminders), '' for carts. status: claimed | sent | failed | skipped. message_id groups the rows of one digest email.
export const remindersLog = pgTable('reminders_log', {
  id: id(),
  kind: text('kind').notNull(),
  clientId: integer('client_id'),
  email: text('email').notNull().default(''),
  item: text('item').notNull(),
  stage: text('stage').notNull(),
  channel: text('channel').notNull(),
  cycle: text('cycle').notNull().default(''),
  status: text('status').notNull().default('claimed'),
  attempts: integer('attempts').notNull().default(1),
  messageId: text('message_id').notNull().default(''),
  error: text('error').notNull().default(''),
  detail: jsonb('detail'),
  createdAt: now('created_at'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  convertedAt: timestamp('converted_at', { withTimezone: true }),
}, (t) => [uniqueIndex('reminders_log_uniq').on(t.kind, t.item, t.stage, t.channel, t.cycle), index('reminders_log_client_idx').on(t.clientId, t.sentAt), index('reminders_log_created_idx').on(t.createdAt)]);
export type ReminderLogRow = typeof remindersLog.$inferSelect;
export type ReminderCartRow = typeof reminderCarts.$inferSelect;
