CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_number" serial NOT NULL,
	"job_name" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"frac_per_ft" double precision,
	"aspect_ratio" double precision,
	"label_size_inches" double precision DEFAULT 5,
	"image_base64" text,
	"image_mime" text DEFAULT 'image/jpeg',
	"job_total" double precision DEFAULT 0 NOT NULL,
	"misc_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"sqft" double precision DEFAULT 0 NOT NULL,
	"perim" double precision DEFAULT 0 NOT NULL,
	"points" jsonb NOT NULL,
	"color" jsonb NOT NULL,
	"price_per_sf" double precision,
	"coating" text,
	"price_per_lf" double precision,
	"doors_excluded" integer DEFAULT 0 NOT NULL,
	"door_width_ft" double precision DEFAULT 3 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;