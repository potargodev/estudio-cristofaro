-- Overrides de módulos por tenant: la tabla pasa a llamarse tenant_modules (mismos datos)
ALTER TABLE "studio_module_overrides" RENAME TO "tenant_modules";--> statement-breakpoint
ALTER TABLE "tenant_modules" RENAME CONSTRAINT "studio_module_overrides_studio_id_module_key_pk" TO "tenant_modules_studio_id_module_key_pk";--> statement-breakpoint
ALTER TABLE "tenant_modules" RENAME CONSTRAINT "studio_module_overrides_studio_id_studios_id_fk" TO "tenant_modules_studio_id_studios_id_fk";--> statement-breakpoint
ALTER TABLE "tenant_modules" RENAME CONSTRAINT "studio_module_overrides_created_by_users_id_fk" TO "tenant_modules_created_by_users_id_fk";
