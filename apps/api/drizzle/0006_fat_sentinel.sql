ALTER TABLE "users" ADD COLUMN "provider" text DEFAULT 'local';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provider_id" text;