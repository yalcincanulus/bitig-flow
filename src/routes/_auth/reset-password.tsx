import { AuthPage } from "#/components/auth-page";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  return <AuthPage title="Reset password" />;
}
