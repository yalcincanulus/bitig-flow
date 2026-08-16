// PROTOTYPE — throwaway route for issue #15 ("Prototype the visitor gate flow").
// Three variants of the /v/<slug> Gate, switchable via ?variant=, every state via
// ?scenario=, phone framing via ?frame=phone. No server functions, no mutations —
// this exists to be looked at and argued with, then deleted.
import { createFileRoute } from "@tanstack/react-router";

import { GateVariantA } from "@/components/prototype/gate-variant-a";
import { GateVariantB } from "@/components/prototype/gate-variant-b";
import { GateVariantC } from "@/components/prototype/gate-variant-c";
import { GateSwitcher, VARIANTS, type Variant } from "@/components/prototype/gate-switcher";
import { SCENARIOS, type Scenario } from "@/components/prototype/gate-scenarios";

interface Search {
  variant: Variant;
  scenario: Scenario;
  frame: "desktop" | "phone";
}

export const Route = createFileRoute("/prototype/gate")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    variant: VARIANTS.includes(search.variant as Variant) ? (search.variant as Variant) : "A",
    scenario: SCENARIOS.includes(search.scenario as Scenario)
      ? (search.scenario as Scenario)
      : "password",
    frame: search.frame === "phone" ? "phone" : "desktop",
  }),
  component: GatePrototype,
});

function GatePrototype() {
  const { variant, scenario, frame } = Route.useSearch();

  const gate =
    variant === "A" ? (
      <GateVariantA scenario={scenario} />
    ) : variant === "B" ? (
      <GateVariantB scenario={scenario} />
    ) : (
      <GateVariantC scenario={scenario} />
    );

  return (
    <>
      {frame === "phone" ? (
        <div className="flex min-h-dvh items-start justify-center bg-zinc-200 p-6">
          <div className="h-[812px] w-[390px] overflow-y-auto rounded-[2.5rem] border-8 border-zinc-900 bg-background shadow-2xl">
            {gate}
          </div>
        </div>
      ) : (
        gate
      )}
      <GateSwitcher variant={variant} scenario={scenario} frame={frame} />
    </>
  );
}
