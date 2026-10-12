CREATE TABLE "job_leases" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text,
	"locked_until" timestamp with time zone DEFAULT now() NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_error" text
);
