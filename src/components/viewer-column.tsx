import type { ReactNode } from "react";

/** The narrow measure a Gate asks for: one column of form, centred on the desk. */
export function ViewerColumn({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[26rem]">{children}</div>;
}
