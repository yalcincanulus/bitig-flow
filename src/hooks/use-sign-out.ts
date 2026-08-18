import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "#/lib/auth-client";

// Onboarding and the Dashboard User menu both end the session the same way, and a second copy of
// this flow is a second place for the post-sign-out destination to drift.
export function useSignOut() {
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

  return { pending, signOut };
}
