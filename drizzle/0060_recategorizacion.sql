CREATE TABLE "recategorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"period" text NOT NULL,
	"activity" text DEFAULT 'servicios' NOT NULL,
	"surface_m2" numeric(10, 2),
	"energy_kw" numeric(12, 2),
	"rent_annual" numeric(14, 2),
	"income_12m" numeric(16, 2),
	"current_category" text,
	"suggested_category" text,
	"final_category" text,
	"movement" text,
	"fee_new" numeric(14, 2),
	"status" text DEFAULT 'pendiente' NOT NULL,
	"receipt_document_id" uuid,
	"scale_status" text,
	"notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"recategorized_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recategorizations" ADD CONSTRAINT "recategorizations_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recategorizations" ADD CONSTRAINT "recategorizations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recategorizations" ADD CONSTRAINT "recategorizations_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recategorizations" ADD CONSTRAINT "recategorizations_receipt_document_id_documents_id_fk" FOREIGN KEY ("receipt_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recategorizations" ADD CONSTRAINT "recategorizations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recategorizations_entity_idx" ON "recategorizations" USING btree ("legal_entity_id","period");--> statement-breakpoint
CREATE INDEX "recategorizations_studio_idx" ON "recategorizations" USING btree ("studio_id","period");