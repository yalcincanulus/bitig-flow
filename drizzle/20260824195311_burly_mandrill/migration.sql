CREATE TABLE "deployment_policy" (
	"id" text PRIMARY KEY DEFAULT 'deployment',
	"sign_up_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "deployment_policy_singleton_check" CHECK ("id" = 'deployment')
);
