CREATE TYPE "public"."role" AS ENUM('OWNER', 'ADMIN', 'EDITOR');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'EDITOR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "api_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"ok" boolean NOT NULL,
	"ms" integer NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"layout" text DEFAULT 'auto' NOT NULL,
	"card_template" text DEFAULT 'plan-card' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"whmcs_group_id" integer,
	"seo_title" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"seo_title" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"seo_keywords" text DEFAULT '' NOT NULL,
	"og_image" text DEFAULT '' NOT NULL,
	"status" "status" DEFAULT 'PUBLISHED' NOT NULL,
	"publish_at" timestamp with time zone,
	"body_class" text DEFAULT '' NOT NULL,
	"wrapper_class" text DEFAULT 'site-wrapper overflow-hidden' NOT NULL,
	"head_extra" text DEFAULT '' NOT NULL,
	"head_block" text DEFAULT 'head' NOT NULL,
	"body_start_block" text DEFAULT 'body_start' NOT NULL,
	"header_block" text DEFAULT 'header' NOT NULL,
	"footer_block" text DEFAULT 'footer' NOT NULL,
	"body_end_block" text DEFAULT 'body_end' NOT NULL,
	"in_sitemap" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"currency" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"suffix" text DEFAULT '' NOT NULL,
	"cycle" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"setup_fee" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"badge" text DEFAULT '' NOT NULL,
	"badge_color" text DEFAULT 'primary' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "status" DEFAULT 'DRAFT' NOT NULL,
	"display_cycle" text DEFAULT 'auto' NOT NULL,
	"order_url" text DEFAULT '' NOT NULL,
	"publish_at" timestamp with time zone,
	"content_locked" boolean DEFAULT false NOT NULL,
	"whmcs_pid" integer,
	"whmcs_gid" integer,
	"whmcs_name" text DEFAULT '' NOT NULL,
	"whmcs_type" text DEFAULT '' NOT NULL,
	"whmcs_hidden" boolean DEFAULT false NOT NULL,
	"whmcs_retired" boolean DEFAULT false NOT NULL,
	"whmcs_url" text DEFAULT '' NOT NULL,
	"pay_type" text DEFAULT '' NOT NULL,
	"synced_at" timestamp with time zone,
	"sync_error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_whmcs_pid_unique" UNIQUE("whmcs_pid")
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" text PRIMARY KEY NOT NULL,
	"from" text NOT NULL,
	"to" text NOT NULL,
	"code" integer DEFAULT 301 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redirects_from_unique" UNIQUE("from")
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"user_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tlds" (
	"id" text PRIMARY KEY NOT NULL,
	"tld" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"register" numeric(12, 2),
	"transfer" numeric(12, 2),
	"renew" numeric(12, 2),
	"featured" boolean DEFAULT false NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"promo" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"synced_at" timestamp with time zone,
	CONSTRAINT "tlds_tld_unique" UNIQUE("tld")
);
--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apilog_created_idx" ON "api_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "price_uniq" ON "product_prices" USING btree ("product_id","currency","cycle");--> statement-breakpoint
CREATE INDEX "products_cat_idx" ON "products" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "rev_entity_idx" ON "revisions" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "sections_page_idx" ON "sections" USING btree ("page_id","sort_order");