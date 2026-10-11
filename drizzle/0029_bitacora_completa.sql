CREATE TABLE "bitacora_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"suggested" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bitacora_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"account_label" text,
	"external_user_id" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'activa' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bitacora_goal_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bitacora_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'otro' NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"target" bigint NOT NULL,
	"saved" bigint DEFAULT 0 NOT NULL,
	"deadline" date,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bitacora_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"file_name" text,
	"mapping" jsonb,
	"status" text DEFAULT 'vista_previa' NOT NULL,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bitacora_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"period" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'nuevo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bitacora_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" text DEFAULT 'gasto' NOT NULL,
	"detected" text NOT NULL,
	"description" text NOT NULL,
	"amount" bigint,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"date" date,
	"category_hint" text,
	"raw" jsonb,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bitacora_recurring" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"key" text NOT NULL,
	"category_id" uuid,
	"kind" text DEFAULT 'fijo' NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"avg_amount" bigint NOT NULL,
	"last_amount" bigint NOT NULL,
	"last_date" date NOT NULL,
	"next_date" date NOT NULL,
	"months" integer DEFAULT 1 NOT NULL,
	"price_change_pct" numeric(7, 2),
	"status" text DEFAULT 'detectado' NOT NULL,
	"source" text DEFAULT 'deteccion' NOT NULL,
	"still_used" boolean,
	"notified_due_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bitacora_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"member_id" uuid,
	"invited_email" text NOT NULL,
	"token" text NOT NULL,
	"permission" text DEFAULT 'ver' NOT NULL,
	"status" text DEFAULT 'invitada' NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"currency" text NOT NULL,
	"kind" text NOT NULL,
	"rate" numeric(14, 4) NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ipc_series" (
	"month" text PRIMARY KEY NOT NULL,
	"value" numeric(14, 4) NOT NULL,
	"source" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD COLUMN "professional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD COLUMN "deductible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD COLUMN "accounting_expense_id" uuid;--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD COLUMN "raw" jsonb;--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD COLUMN "validation" text;--> statement-breakpoint
ALTER TABLE "bitacora_entries" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bitacora_budgets" ADD CONSTRAINT "bitacora_budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_budgets" ADD CONSTRAINT "bitacora_budgets_category_id_bitacora_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."bitacora_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_connections" ADD CONSTRAINT "bitacora_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_goal_moves" ADD CONSTRAINT "bitacora_goal_moves_goal_id_bitacora_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."bitacora_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_goals" ADD CONSTRAINT "bitacora_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_imports" ADD CONSTRAINT "bitacora_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_insights" ADD CONSTRAINT "bitacora_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_proposals" ADD CONSTRAINT "bitacora_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_recurring" ADD CONSTRAINT "bitacora_recurring_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_recurring" ADD CONSTRAINT "bitacora_recurring_category_id_bitacora_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."bitacora_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_shares" ADD CONSTRAINT "bitacora_shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora_shares" ADD CONSTRAINT "bitacora_shares_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ipc_series" ADD CONSTRAINT "ipc_series_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bitacora_budgets_cat_idx" ON "bitacora_budgets" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bitacora_connections_provider_idx" ON "bitacora_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "bitacora_goals_user_idx" ON "bitacora_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bitacora_imports_user_idx" ON "bitacora_imports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bitacora_insights_once_idx" ON "bitacora_insights" USING btree ("user_id","kind","period","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "bitacora_proposals_ext_idx" ON "bitacora_proposals" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bitacora_recurring_key_idx" ON "bitacora_recurring" USING btree ("user_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "bitacora_shares_token_idx" ON "bitacora_shares" USING btree ("token");--> statement-breakpoint
CREATE INDEX "bitacora_shares_member_idx" ON "bitacora_shares" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_snapshots_day_idx" ON "fx_snapshots" USING btree ("date","currency","kind");