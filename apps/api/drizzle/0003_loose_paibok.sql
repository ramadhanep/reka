CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"current_state_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"is_initial" boolean DEFAULT false NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_transition_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"transition_id" uuid,
	"transition_key" text NOT NULL,
	"from_state_id" uuid,
	"from_state_key" text NOT NULL,
	"to_state_id" uuid,
	"to_state_key" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"comment" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"from_state_id" uuid NOT NULL,
	"to_state_id" uuid NOT NULL,
	"required_permission" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_current_state_id_workflow_states_id_fk" FOREIGN KEY ("current_state_id") REFERENCES "public"."workflow_states"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_states" ADD CONSTRAINT "workflow_states_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transition_history" ADD CONSTRAINT "workflow_transition_history_instance_id_workflow_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transition_history" ADD CONSTRAINT "workflow_transition_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transition_history" ADD CONSTRAINT "workflow_transition_history_transition_id_workflow_transitions_id_fk" FOREIGN KEY ("transition_id") REFERENCES "public"."workflow_transitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transition_history" ADD CONSTRAINT "workflow_transition_history_from_state_id_workflow_states_id_fk" FOREIGN KEY ("from_state_id") REFERENCES "public"."workflow_states"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transition_history" ADD CONSTRAINT "workflow_transition_history_to_state_id_workflow_states_id_fk" FOREIGN KEY ("to_state_id") REFERENCES "public"."workflow_states"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transition_history" ADD CONSTRAINT "workflow_transition_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_from_state_id_workflow_states_id_fk" FOREIGN KEY ("from_state_id") REFERENCES "public"."workflow_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_to_state_id_workflow_states_id_fk" FOREIGN KEY ("to_state_id") REFERENCES "public"."workflow_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_definitions_key_idx" ON "workflow_definitions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "workflow_definitions_org_key_ver_idx" ON "workflow_definitions" USING btree ("organization_id","key","version");--> statement-breakpoint
CREATE INDEX "workflow_instances_org_idx" ON "workflow_instances" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workflow_instances_subject_idx" ON "workflow_instances" USING btree ("organization_id","subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_states_def_key_unique" ON "workflow_states" USING btree ("workflow_definition_id","key");--> statement-breakpoint
CREATE INDEX "workflow_history_instance_idx" ON "workflow_transition_history" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "workflow_history_org_idx" ON "workflow_transition_history" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_transitions_def_key_from_unique" ON "workflow_transitions" USING btree ("workflow_definition_id","key","from_state_id");