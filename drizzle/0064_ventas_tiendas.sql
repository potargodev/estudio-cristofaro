ALTER TABLE "stock_store_orders" ADD COLUMN "billing_status" text;--> statement-breakpoint
ALTER TABLE "stock_store_orders" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_store_orders" ADD COLUMN "credit_note_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_store_orders" ADD COLUMN "billing_error" text;--> statement-breakpoint
ALTER TABLE "stock_stores" ADD COLUMN "billing_mode" text DEFAULT 'ninguna' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_stores" ADD COLUMN "billing_cuit" text;--> statement-breakpoint
ALTER TABLE "stock_stores" ADD COLUMN "billing_pos" integer;--> statement-breakpoint
ALTER TABLE "stock_store_orders" ADD CONSTRAINT "stock_store_orders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_store_orders" ADD CONSTRAINT "stock_store_orders_credit_note_id_invoices_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_store_orders_billing_idx" ON "stock_store_orders" USING btree ("billing_status","store_id");