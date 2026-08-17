import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/sign-up")({ component: SignUpPage });

function SignUpPage() {
  return <h1>Sign up</h1>;
}
