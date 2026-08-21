import { ScriptOnce } from "@tanstack/react-router";
import { useEffect } from "react";

import { applyTheme, storedTheme, systemTheme, themeScript } from "#/lib/theme";

/**
 * Sits in the document shell so it is mounted on every page: it inlines the pre-hydration script
 * that paints the right theme immediately, and then keeps a User who has never chosen a theme in
 * step with their operating system, so switching the OS to dark at dusk switches the app too.
 */
export function ThemeScript() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    // The stored choice is read when the OS changes rather than when the listener is attached,
    // because a User who toggles mid-session has to stop being followed from that moment on.
    const followSystem = () => {
      if (storedTheme() === undefined) applyTheme(systemTheme());
    };
    media.addEventListener("change", followSystem);

    return () => media.removeEventListener("change", followSystem);
  }, []);

  return <ScriptOnce>{themeScript}</ScriptOnce>;
}
