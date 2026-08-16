ALTER TABLE "transactions" ADD COLUMN "category_source" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
-- Written by hand: drizzle-kit 0.20 does not emit `check()` constraints, so the
-- type and status checks declared in schema.ts do not exist in the database
-- either. This one is enforced because a category_source the application does
-- not recognise would make a user correction silently re-categorizable.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_source_check" CHECK ("category_source" IN ('auto', 'user'));
