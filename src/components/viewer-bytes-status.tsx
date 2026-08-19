"use client";

import { useState } from "react";

export function useViewerBytesReady(bytesPending: boolean, bytesUrl: string) {
  const [pending, setPending] = useState(bytesPending);

  async function retry() {
    const response = await fetch(bytesUrl, { credentials: "same-origin" });
    await response.body?.cancel();
    if (response.status === 409) {
      setPending(true);
      return;
    }
    if (response.ok) setPending(false);
  }

  return { pending, retry };
}
