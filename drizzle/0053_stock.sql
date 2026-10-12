CREATE TABLE "stock_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"product_id" uuid NOT NULL,
	"source" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"faro_qty" numeric(14, 3) NOT NULL,
	"remote_qty" numeric(14, 3) NOT NULL,
	"published_qty" numeric(14, 3),
	"status" text DEFAULT 'abierto' NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"deposit_id" uuid NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'cerrado' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"sku" text,
	"title" text NOT NULL,
	"product_id" uuid,
	"linked_by" text,
	"suggested_product_id" uuid,
	"suggestion_score" numeric(4, 3),
	"suggestion_reason" text,
	"last_published_qty" numeric(14, 3),
	"remote_qty" numeric(14, 3),
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"deposit_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 2),
	"source_type" text NOT NULL,
	"source_id" text,
	"idem_key" text,
	"reason" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"barcode" text,
	"description" text NOT NULL,
	"unit" text DEFAULT 'unidad' NOT NULL,
	"iva_rate" numeric(5, 2) DEFAULT '21' NOT NULL,
	"cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"min_stock" numeric(12, 3),
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"alerted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"error" text,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_store_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"status" text NOT NULL,
	"lines" jsonb NOT NULL,
	"raw" jsonb,
	"via" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"name" text NOT NULL,
	"shop_id" text NOT NULL,
	"credentials_enc" text,
	"deposit_id" uuid,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"safety_margin" numeric(12, 3) DEFAULT '0' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"webhook_token" text NOT NULL,
	"last_poll_at" timestamp with time zone,
	"last_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_unlinked" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"line" integer NOT NULL,
	"store_id" uuid,
	"listing_external_id" text,
	"sku" text,
	"title" text NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_aliases" ADD CONSTRAINT "stock_aliases_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_aliases" ADD CONSTRAINT "stock_aliases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_aliases" ADD CONSTRAINT "stock_aliases_product_id_stock_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."stock_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_aliases" ADD CONSTRAINT "stock_aliases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflicts" ADD CONSTRAINT "stock_conflicts_store_id_stock_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stock_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflicts" ADD CONSTRAINT "stock_conflicts_listing_id_stock_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."stock_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflicts" ADD CONSTRAINT "stock_conflicts_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflicts" ADD CONSTRAINT "stock_conflicts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_conflicts" ADD CONSTRAINT "stock_conflicts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_deposit_id_stock_deposits_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."stock_deposits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_deposits" ADD CONSTRAINT "stock_deposits_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_deposits" ADD CONSTRAINT "stock_deposits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_listings" ADD CONSTRAINT "stock_listings_store_id_stock_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stock_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_listings" ADD CONSTRAINT "stock_listings_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_listings" ADD CONSTRAINT "stock_listings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_listings" ADD CONSTRAINT "stock_listings_product_id_stock_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."stock_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_listings" ADD CONSTRAINT "stock_listings_suggested_product_id_stock_products_id_fk" FOREIGN KEY ("suggested_product_id") REFERENCES "public"."stock_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_stock_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."stock_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_deposit_id_stock_deposits_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."stock_deposits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_products" ADD CONSTRAINT "stock_products_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_products" ADD CONSTRAINT "stock_products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_publications" ADD CONSTRAINT "stock_publications_store_id_stock_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stock_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_publications" ADD CONSTRAINT "stock_publications_listing_id_stock_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."stock_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_publications" ADD CONSTRAINT "stock_publications_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_publications" ADD CONSTRAINT "stock_publications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_store_orders" ADD CONSTRAINT "stock_store_orders_store_id_stock_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stock_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_store_orders" ADD CONSTRAINT "stock_store_orders_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_store_orders" ADD CONSTRAINT "stock_store_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_stores" ADD CONSTRAINT "stock_stores_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_stores" ADD CONSTRAINT "stock_stores_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_stores" ADD CONSTRAINT "stock_stores_deposit_id_stock_deposits_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."stock_deposits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_stores" ADD CONSTRAINT "stock_stores_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_unlinked" ADD CONSTRAINT "stock_unlinked_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_unlinked" ADD CONSTRAINT "stock_unlinked_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_unlinked" ADD CONSTRAINT "stock_unlinked_store_id_stock_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stock_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_aliases_idx" ON "stock_aliases" USING btree ("organization_id","alias");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_deposits_org_name_idx" ON "stock_deposits" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_listings_store_ext_idx" ON "stock_listings" USING btree ("store_id","external_id");--> statement-breakpoint
CREATE INDEX "stock_movements_prod_idx" ON "stock_movements" USING btree ("product_id","at");--> statement-breakpoint
CREATE INDEX "stock_movements_org_idx" ON "stock_movements" USING btree ("organization_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_idem_idx" ON "stock_movements" USING btree ("organization_id","idem_key") WHERE "stock_movements"."idem_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_products_org_code_idx" ON "stock_products" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "stock_products_barcode_idx" ON "stock_products" USING btree ("organization_id","barcode");--> statement-breakpoint
CREATE INDEX "stock_publications_store_idx" ON "stock_publications" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_store_orders_ext_idx" ON "stock_store_orders" USING btree ("store_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_stores_token_idx" ON "stock_stores" USING btree ("webhook_token");--> statement-breakpoint
CREATE INDEX "stock_stores_org_idx" ON "stock_stores" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_unlinked_src_idx" ON "stock_unlinked" USING btree ("organization_id","source_type","source_id","line");