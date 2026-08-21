import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "#/components/ui/button";
import { toggleTheme } from "#/lib/theme";

/**
 * One button, two states. Which icon shows is decided by CSS rather than by React state, because
 * the server cannot know a User's theme: rendering the icon from state would either flash the
 * wrong one or force the button to stay blank until hydration.
 */
export function ThemeToggle() {
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={() => toggleTheme()}>
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}
