CREATE TABLE "adapter_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid,
	"adapter" text NOT NULL,
	"record_id" uuid NOT NULL,
	"fields" jsonb NOT NULL,
	"incoming" jsonb NOT NULL,
	"status" text DEFAULT 'abierto' NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_adapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"adapter" text NOT NULL,
	"status" text DEFAULT 'activo' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_result" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"area" text NOT NULL,
	"source" text DEFAULT 'faro' NOT NULL,
	"set_by" uuid,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_migrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"adapter" text NOT NULL,
	"step" text DEFAULT 'traer' NOT NULL,
	"totals" jsonb,
	"areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_records" ADD COLUMN "faro_edits" jsonb;--> statement-breakpoint
ALTER TABLE "external_records" ADD COLUMN "local_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "adapter_conflicts" ADD CONSTRAINT "adapter_conflicts_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adapter_conflicts" ADD CONSTRAINT "adapter_conflicts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adapter_conflicts" ADD CONSTRAINT "adapter_conflicts_record_id_external_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."external_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adapter_conflicts" ADD CONSTRAINT "adapter_conflicts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_adapters" ADD CONSTRAINT "org_adapters_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_adapters" ADD CONSTRAINT "org_adapters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_adapters" ADD CONSTRAINT "org_adapters_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_sources" ADD CONSTRAINT "org_sources_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_sources" ADD CONSTRAINT "org_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_sources" ADD CONSTRAINT "org_sources_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_migrations" ADD CONSTRAINT "source_migrations_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_migrations" ADD CONSTRAINT "source_migrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_migrations" ADD CONSTRAINT "source_migrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adapter_conflicts_org_idx" ON "adapter_conflicts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "adapter_conflicts_open_idx" ON "adapter_conflicts" USING btree ("record_id") WHERE status = 'abierto';--> statement-breakpoint
CREATE UNIQUE INDEX "org_adapters_idx" ON "org_adapters" USING btree ("organization_id","adapter");--> statement-breakpoint
CREATE UNIQUE INDEX "org_sources_area_idx" ON "org_sources" USING btree ("organization_id","area");--> statement-breakpoint
CREATE INDEX "source_migrations_org_idx" ON "source_migrations" USING btree ("organization_id","created_at");