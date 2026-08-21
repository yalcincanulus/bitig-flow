import type { ReactNode } from "react";

/**
 * The Viewer chrome: a desk. Nothing here constrains the width — a Gate page asks for the narrow
 * ViewerColumn, a Document lays its paper out on the desk itself.
 */
export function ViewerShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-viewer-desk">
      <div className="px-4 pt-8 pb-24 sm:px-6 sm:pt-12">{children}</div>
    </div>
  );
}
