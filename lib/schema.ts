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
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [index('posts_status_publish_idx').on(t.status, t.publishAt)]);

export type Product = typeof products.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Tld = typeof tlds.$inferSelect;
