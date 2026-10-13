CREATE TABLE "inflation_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"year_start" date NOT NULL,
	"year_end" date NOT NULL,
	"indexes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recpam" bigint DEFAULT 0 NOT NULL,
	"entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inflation_indexes" (
	"series" text DEFAULT 'facpce' NOT NULL,
	"month" text NOT NULL,
	"value" numeric(18, 6) NOT NULL,
	"source" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inflation_indexes_series_month_pk" PRIMARY KEY("series","month")
);
--> statement-breakpoint
ALTER TABLE "inflation_adjustments" ADD CONSTRAINT "inflation_adjustments_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inflation_adjustments" ADD CONSTRAINT "inflation_adjustments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inflation_adjustments" ADD CONSTRAINT "inflation_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inflation_indexes" ADD CONSTRAINT "inflation_indexes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inflation_adjustments_year_idx" ON "inflation_adjustments" USING btree ("organization_id","year_end");