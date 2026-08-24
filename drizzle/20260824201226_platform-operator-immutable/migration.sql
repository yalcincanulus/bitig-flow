CREATE FUNCTION reject_platform_operator_binding_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'the Platform Operator binding is immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER platform_operator_binding_immutable
	BEFORE UPDATE OR DELETE ON platform_operator
	FOR EACH ROW
	EXECUTE FUNCTION reject_platform_operator_binding_change();
