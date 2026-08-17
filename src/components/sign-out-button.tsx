import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";

export function SignOutButton() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);

    try {
      await authClient.signOut();
      await navigate({ href: "/" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => void signOut()}
    >
      Sign out
    </Button>
  );
}
