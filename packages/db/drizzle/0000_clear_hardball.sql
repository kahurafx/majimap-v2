CREATE SCHEMA "gis";
--> statement-breakpoint
CREATE TYPE "gis"."condition" AS ENUM('good', 'fair', 'poor', 'critical', 'unknown');--> statement-breakpoint
CREATE TYPE "gis"."gis_role" AS ENUM('admin', 'gis_engineer', 'field_technician', 'viewer');--> statement-breakpoint
CREATE TYPE "gis"."node_type" AS ENUM('reservoir', 'pumping_station', 'valve', 'junction', 'meter', 'hydrant');--> statement-breakpoint
CREATE TYPE "gis"."pipe_material" AS ENUM('pvc', 'ductile_iron', 'hdpe', 'steel', 'concrete', 'unknown');--> statement-breakpoint
CREATE TYPE "gis"."structure_type" AS ENUM('vault', 'chamber', 'manhole', 'kiosk', 'trench');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"password" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"inviter_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_modules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"module_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"owner_module" text NOT NULL,
	"label" text NOT NULL,
	"asset_type" text NOT NULL,
	"location" geometry(Point, 4326),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"source_module" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gis"."nodes" (
	"version_id" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"is_head" boolean DEFAULT true NOT NULL,
	"supersedes_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"type" "gis"."node_type" NOT NULL,
	"name" text NOT NULL,
	"location" geometry(Point, 4326) NOT NULL,
	"condition" "gis"."condition" DEFAULT 'unknown' NOT NULL,
	"is_open" boolean,
	"structure_id" text,
	"installed_at" timestamp with time zone,
	"last_inspected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gis"."pipes" (
	"version_id" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"is_head" boolean DEFAULT true NOT NULL,
	"supersedes_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"from_node_id" text NOT NULL,
	"to_node_id" text NOT NULL,
	"path" geometry(LineString, 4326) NOT NULL,
	"material" "gis"."pipe_material" DEFAULT 'unknown' NOT NULL,
	"diameter_mm" real NOT NULL,
	"condition" "gis"."condition" DEFAULT 'unknown' NOT NULL,
	"length_m" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gis"."structure_attachment_rules" (
	"node_type" "gis"."node_type" NOT NULL,
	"structure_type" "gis"."structure_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gis"."structures" (
	"version_id" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"is_head" boolean DEFAULT true NOT NULL,
	"supersedes_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"type" "gis"."structure_type" NOT NULL,
	"name" text NOT NULL,
	"location" geometry(Point, 4326) NOT NULL,
	"condition" "gis"."condition" DEFAULT 'unknown' NOT NULL,
	"installed_at" timestamp with time zone,
	"last_inspected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gis"."subnetworks" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"tier_id" text NOT NULL,
	"controller_node_id" text NOT NULL,
	"last_validated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gis"."tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gis"."dma_boundary_valves" (
	"id" text PRIMARY KEY NOT NULL,
	"dma_version_id" text NOT NULL,
	"valve_asset_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gis"."dmas" (
	"version_id" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"is_head" boolean DEFAULT true NOT NULL,
	"supersedes_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"tier_id" text NOT NULL,
	"inlet_meter_id" text NOT NULL,
	"boundary" geometry(Polygon, 4326) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gis"."gis_user_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "gis"."gis_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_modules" ADD CONSTRAINT "organization_modules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."nodes" ADD CONSTRAINT "nodes_id_assets_id_fk" FOREIGN KEY ("id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."nodes" ADD CONSTRAINT "nodes_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."nodes" ADD CONSTRAINT "nodes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."nodes" ADD CONSTRAINT "nodes_structure_id_assets_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."pipes" ADD CONSTRAINT "pipes_id_assets_id_fk" FOREIGN KEY ("id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."pipes" ADD CONSTRAINT "pipes_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."pipes" ADD CONSTRAINT "pipes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."pipes" ADD CONSTRAINT "pipes_from_node_id_assets_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."pipes" ADD CONSTRAINT "pipes_to_node_id_assets_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."structures" ADD CONSTRAINT "structures_id_assets_id_fk" FOREIGN KEY ("id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."structures" ADD CONSTRAINT "structures_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."structures" ADD CONSTRAINT "structures_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."subnetworks" ADD CONSTRAINT "subnetworks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."subnetworks" ADD CONSTRAINT "subnetworks_tier_id_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "gis"."tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."subnetworks" ADD CONSTRAINT "subnetworks_controller_node_id_assets_id_fk" FOREIGN KEY ("controller_node_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."tiers" ADD CONSTRAINT "tiers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."dma_boundary_valves" ADD CONSTRAINT "dma_boundary_valves_dma_version_id_dmas_version_id_fk" FOREIGN KEY ("dma_version_id") REFERENCES "gis"."dmas"("version_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."dma_boundary_valves" ADD CONSTRAINT "dma_boundary_valves_valve_asset_id_assets_id_fk" FOREIGN KEY ("valve_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."dmas" ADD CONSTRAINT "dmas_id_assets_id_fk" FOREIGN KEY ("id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."dmas" ADD CONSTRAINT "dmas_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."dmas" ADD CONSTRAINT "dmas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."dmas" ADD CONSTRAINT "dmas_tier_id_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "gis"."tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."dmas" ADD CONSTRAINT "dmas_inlet_meter_id_assets_id_fk" FOREIGN KEY ("inlet_meter_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."gis_user_roles" ADD CONSTRAINT "gis_user_roles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis"."gis_user_roles" ADD CONSTRAINT "gis_user_roles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_module_unique" ON "organization_modules" USING btree ("organization_id","module_key");--> statement-breakpoint
CREATE INDEX "organization_modules_org_idx" ON "organization_modules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "assets_org_idx" ON "assets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "customers_org_idx" ON "customers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "attachments_subject_idx" ON "attachments" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "domain_events_org_idx" ON "domain_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "domain_events_unprocessed_idx" ON "domain_events" USING btree ("processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "nodes_head_unique" ON "gis"."nodes" USING btree ("id","branch") WHERE "gis"."nodes"."is_head" = true;--> statement-breakpoint
CREATE INDEX "nodes_org_idx" ON "gis"."nodes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "nodes_structure_idx" ON "gis"."nodes" USING btree ("structure_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipes_head_unique" ON "gis"."pipes" USING btree ("id","branch") WHERE "gis"."pipes"."is_head" = true;--> statement-breakpoint
CREATE INDEX "pipes_org_idx" ON "gis"."pipes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pipes_from_idx" ON "gis"."pipes" USING btree ("from_node_id");--> statement-breakpoint
CREATE INDEX "pipes_to_idx" ON "gis"."pipes" USING btree ("to_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attachment_rule_unique" ON "gis"."structure_attachment_rules" USING btree ("node_type","structure_type");--> statement-breakpoint
CREATE UNIQUE INDEX "structures_head_unique" ON "gis"."structures" USING btree ("id","branch") WHERE "gis"."structures"."is_head" = true;--> statement-breakpoint
CREATE INDEX "structures_org_idx" ON "gis"."structures" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tiers_org_order_unique" ON "gis"."tiers" USING btree ("organization_id","order");--> statement-breakpoint
CREATE INDEX "dma_boundary_valves_version_idx" ON "gis"."dma_boundary_valves" USING btree ("dma_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dma_boundary_valve_unique" ON "gis"."dma_boundary_valves" USING btree ("dma_version_id","valve_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dmas_head_unique" ON "gis"."dmas" USING btree ("id","branch") WHERE "gis"."dmas"."is_head" = true;--> statement-breakpoint
CREATE INDEX "dmas_org_idx" ON "gis"."dmas" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gis_user_role_unique" ON "gis"."gis_user_roles" USING btree ("organization_id","user_id");