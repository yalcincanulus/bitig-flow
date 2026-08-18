import type { ReactNode } from "react";

export function ViewerColumn({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh px-6 pt-14 pb-24 sm:pt-24">
      <div className="mx-auto w-full max-w-[26rem]">
        <div className="mb-10 font-mono text-xs tracking-tight text-muted-foreground">bitig</div>
        {children}
      </div>
    </div>
  );
}
