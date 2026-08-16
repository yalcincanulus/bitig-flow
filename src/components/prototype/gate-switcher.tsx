// PROTOTYPE — throwaway switcher bar. Not production UI; deliberately loud so it
// can never be mistaken for part of the design under evaluation.
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Smartphone, Monitor } from "lucide-react";

import { SCENARIOS, SCENARIO_LABELS, type Scenario } from "./gate-scenarios";

export const VARIANTS = ["A", "B", "C"] as const;
export type Variant = (typeof VARIANTS)[number];

export const VARIANT_NAMES: Record<Variant, string> = {
  A: "Envelope — sender-forward, one big card",
  B: "Counter — split panel, explicit stepper",
  C: "Doorway — minimal, reveals nothing pre-gate",
};

interface Props {
  variant: Variant;
  scenario: Scenario;
  frame: "desktop" | "phone";
}

export function GateSwitcher({ variant, scenario, frame }: Props) {
  const navigate = useNavigate({ from: "/prototype/gate" });

  const cycle = (delta: number) => {
    const i = VARIANTS.indexOf(variant);
    const next = VARIANTS[(i + delta + VARIANTS.length) % VARIANTS.length];
    navigate({ search: (s) => ({ ...s, variant: next }), replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-3">
      <div className="pointer-events-auto flex max-w-[95vw] flex-col gap-2 rounded-xl border-2 border-fuchsia-500 bg-zinc-950 p-2 text-white shadow-2xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => cycle(-1)}
            className="rounded-md p-1.5 hover:bg-white/15"
            aria-label="Previous variant"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1 text-center text-xs">
            <span className="font-mono font-bold text-fuchsia-400">{variant}</span>{" "}
            <span className="text-white/70">{VARIANT_NAMES[variant]}</span>
          </div>
          <button
            type="button"
            onClick={() => cycle(1)}
            className="rounded-md p-1.5 hover:bg-white/15"
            aria-label="Next variant"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              navigate({
                search: (s) => ({ ...s, frame: frame === "phone" ? "desktop" : "phone" }),
                replace: true,
              })
            }
            className="rounded-md p-1.5 hover:bg-white/15"
            aria-label="Toggle phone frame"
          >
            {frame === "phone" ? <Monitor className="size-4" /> : <Smartphone className="size-4" />}
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-1">
          {SCENARIOS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                navigate({ search: (prev) => ({ ...prev, scenario: s }), replace: true })
              }
              className={
                "rounded px-1.5 py-1 text-[10px] leading-none " +
                (s === scenario
                  ? "bg-fuchsia-500 font-semibold text-white"
                  : "bg-white/10 text-white/70 hover:bg-white/20")
              }
            >
              {SCENARIO_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
