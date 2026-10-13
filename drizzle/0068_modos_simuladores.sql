CREATE TABLE "service_modes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid,
	"service" text NOT NULL,
	"mode" text NOT NULL,
	"set_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulator_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid,
	"service" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulator_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"key" text NOT NULL,
	"studio_id" uuid,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_modes" ADD CONSTRAINT "service_modes_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_modes" ADD CONSTRAINT "service_modes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_modes" ADD CONSTRAINT "service_modes_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulator_events" ADD CONSTRAINT "simulator_events_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulator_state" ADD CONSTRAINT "simulator_state_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_modes_studio_idx" ON "service_modes" USING btree ("studio_id","service") WHERE "service_modes"."organization_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "service_modes_org_idx" ON "service_modes" USING btree ("organization_id","service") WHERE "service_modes"."organization_id" is not null;--> statement-breakpoint
CREATE INDEX "simulator_events_idx" ON "simulator_events" USING btree ("service","created_at");--> statement-breakpoint
CREATE INDEX "simulator_events_studio_idx" ON "simulator_events" USING btree ("studio_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "simulator_state_key_idx" ON "simulator_state" USING btree ("service","key");