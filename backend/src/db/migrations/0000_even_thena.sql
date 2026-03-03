CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"simplefin_id" text,
	"institution" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"last_balance" numeric(12, 2),
	"last_synced_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"include_in_view" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_simplefin_id_unique" UNIQUE("simplefin_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recurring_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurring_transaction_id" uuid NOT NULL,
	"original_date" date NOT NULL,
	"override_type" text NOT NULL,
	"override_date" date,
	"override_amount" numeric(12, 2),
	"override_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recurring_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"frequency" text NOT NULL,
	"next_date" date NOT NULL,
	"end_date" date,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text NOT NULL,
	"accounts_synced" integer DEFAULT 0,
	"transactions_fetched" integer DEFAULT 0,
	"transactions_reconciled" integer DEFAULT 0,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"simplefin_id" text,
	"account_id" uuid NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_simplefin_id_unique" UNIQUE("simplefin_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_overrides_recurring" ON "recurring_overrides" ("recurring_transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recurring_account" ON "recurring_transactions" ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_account_date" ON "transactions" ("account_id","date");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_overrides" ADD CONSTRAINT "recurring_overrides_recurring_transaction_id_recurring_transactions_id_fk" FOREIGN KEY ("recurring_transaction_id") REFERENCES "recurring_transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
