CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity" numeric(18, 4) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_balances_quantity_nonnegative" CHECK ("stock_balances"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"type" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" uuid,
	"reason" text,
	"reference" text,
	"notes" text,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_quantity_positive" CHECK ("stock_movements"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "warehouse_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_location_id_warehouse_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_warehouse_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_org_sku_unique" ON "inventory_items" USING btree ("organization_id","sku");--> statement-breakpoint
CREATE INDEX "inventory_items_org_idx" ON "inventory_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inventory_items_org_status_idx" ON "inventory_items" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_balances_org_item_location_unique" ON "stock_balances" USING btree ("organization_id","inventory_item_id","location_id");--> statement-breakpoint
CREATE INDEX "stock_balances_org_idx" ON "stock_balances" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "stock_balances_item_idx" ON "stock_balances" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "stock_balances_location_idx" ON "stock_balances" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_goods_receipt_unique" ON "stock_movements" USING btree ("organization_id","reference_id") WHERE "stock_movements"."reference_type" = 'GOODS_RECEIPT';--> statement-breakpoint
CREATE INDEX "stock_movements_org_idx" ON "stock_movements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "stock_movements_item_idx" ON "stock_movements" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "stock_movements_location_idx" ON "stock_movements" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "stock_movements_org_type_idx" ON "stock_movements" USING btree ("organization_id","type");--> statement-breakpoint
CREATE INDEX "stock_movements_item_type_idx" ON "stock_movements" USING btree ("inventory_item_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_locations_warehouse_code_unique" ON "warehouse_locations" USING btree ("warehouse_id","code");--> statement-breakpoint
CREATE INDEX "warehouse_locations_org_idx" ON "warehouse_locations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "warehouse_locations_warehouse_idx" ON "warehouse_locations" USING btree ("warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_org_code_unique" ON "warehouses" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "warehouses_org_idx" ON "warehouses" USING btree ("organization_id");