import { AuthPage } from "#/components/auth-page";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return <AuthPage title="Forgot password" />;
}
