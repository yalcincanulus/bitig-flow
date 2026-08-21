// The theme lives on `<html>` as a `light` or `dark` class, because that is what the `dark` variant
// in `styles.css` looks for. A User who has never touched the toggle has no stored choice, and the
// absence is meaningful: it means "follow the operating system", so the theme keeps tracking the
// OS until the User overrides it once.

export const THEME_STORAGE_KEY = "theme";

export type Theme = "light" | "dark";

/**
 * Runs before React hydrates so the first paint is already the right theme. It is a string rather
 * than a function because it has to be inlined into the document: a module would arrive too late
 * and the User would see a flash of the wrong background.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var e=document.documentElement;e.classList.add(t);e.style.colorScheme=t}catch(e){}})();`;

export function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function storedTheme(): Theme | undefined {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);

    return stored === "light" || stored === "dark" ? stored : undefined;
  } catch {
    // Storage can be denied outright — private windows, blocked third-party contexts — and a theme
    // is not worth failing a render over.
    return undefined;
  }
}

// The class on `<html>` is the source of truth after the inline script has run, so reading it back
// is what lets the toggle flip the theme without holding state that hydration could disagree with.
export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  // `color-scheme` is what makes the browser's own chrome — scrollbars, form controls — match.
  root.style.colorScheme = theme;
}

/** Flips the theme and remembers it, which is also what ends the follow-the-OS phase. */
export function toggleTheme(): Theme {
  const next = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // A theme that survives only the session still beats a theme that throws.
  }

  return next;
}
