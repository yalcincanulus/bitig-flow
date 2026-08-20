import type { ReactNode } from "react";

/**
 * The Viewer chrome: a wordmark bar over a desk. Nothing here constrains the width — a Gate page
 * asks for the narrow ViewerColumn, a Document lays its paper out on the desk itself.
 */
export function ViewerShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-viewer-desk">
      <header className="sticky top-0 z-10 border-b bg-background/85 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="font-mono text-xs tracking-tight text-muted-foreground">bitig</div>
      </header>
      <div className="px-4 pt-8 pb-24 sm:px-6 sm:pt-12">{children}</div>
    </div>
  );
}
