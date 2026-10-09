-- Toda fila ya tiene organization_id (migración 0004); esto es solo resguardo
DELETE FROM "obligations" WHERE "organization_id" IS NULL
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "obligations" DROP CONSTRAINT "obligations_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "requests" DROP CONSTRAINT "requests_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "tango_companies" DROP CONSTRAINT "tango_companies_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "tango_records" DROP CONSTRAINT "tango_records_client_id_clients_id_fk";
--> statement-breakpoint
DROP INDEX "documents_client_idx";
--> statement-breakpoint
DROP INDEX "obligations_client_idx";
--> statement-breakpoint
DROP INDEX "requests_client_idx";
--> statement-breakpoint
DROP INDEX "tango_records_client_idx";
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "obligations" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "requests" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX "documents_org_idx" ON "documents" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "obligations_org_idx" ON "obligations" USING btree ("organization_id","due_date");
--> statement-breakpoint
CREATE INDEX "requests_org_idx" ON "requests" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "tango_records_org_idx" ON "tango_records" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "client_id";
--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "client_id";
--> statement-breakpoint
ALTER TABLE "obligations" DROP COLUMN "client_id";
--> statement-breakpoint
ALTER TABLE "requests" DROP COLUMN "client_id";
--> statement-breakpoint
ALTER TABLE "tango_companies" DROP COLUMN "client_id";
--> statement-breakpoint
ALTER TABLE "tango_records" DROP COLUMN "client_id";
--> statement-breakpoint
DROP TABLE "client_users" CASCADE;
--> statement-breakpoint
DROP TABLE "clients" CASCADE;
