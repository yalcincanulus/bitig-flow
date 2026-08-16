// PROTOTYPE — throwaway. Answers issue #15: "what does a Visitor see and feel at /v/<slug>?"
// Three variants of the Gate, switchable via ?variant=, all states via ?scenario=.
// No server, no mutations — every state is rendered directly from the URL.

export const SCENARIOS = [
  "password",
  "password-wrong",
  "email",
  "email-capture-only",
  "code",
  "code-wrong",
  "code-expired",
  "code-locked",
  "rate-limited",
  "unavailable",
  "passed-vault",
  "passed-vault-empty",
] as const;

export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_LABELS: Record<Scenario, string> = {
  password: "Step 1 — password",
  "password-wrong": "Step 1 — wrong password",
  email: "Step 2 — email (code follows)",
  "email-capture-only": "Step 2 — email (capture only)",
  code: "Step 3 — code sent",
  "code-wrong": "Step 3 — wrong code",
  "code-expired": "Step 3 — code expired",
  "code-locked": "Step 3 — 5-attempt wall",
  "rate-limited": "Step 3 — rate limited",
  unavailable: "Terminal — link unavailable",
  "passed-vault": "Passed — vault contents",
  "passed-vault-empty": "Passed — empty vault",
};

/** Which gate step a scenario sits on, if any. */
export function stepOf(scenario: Scenario): "password" | "email" | "code" | null {
  if (scenario.startsWith("password")) return "password";
  if (scenario.startsWith("email")) return "email";
  if (scenario === "unavailable" || scenario.startsWith("passed")) return null;
  return "code";
}

/** The link, as the loader would hand it to the Gate. */
export const LINK = {
  slug: "k3np7qwr9x2f",
  senderName: "Yalçıncan Ulus",
  senderInitials: "YU",
  orgName: "Bitig Studio",
  targetKind: "vault" as const,
  targetTitle: "Q3 Investor Update",
  itemCount: 4,
  requirements: ["password", "email", "code"] as const,
};

export const MASKED_EMAIL = "a•••••a@gmail.com";

export const VAULT_ITEMS = [
  { id: "1", title: "Q3 Investor Letter", kind: "markdown" as const, meta: "6 min read" },
  { id: "2", title: "Financial Summary Q3 2026", kind: "pdf" as const, meta: "14 pages" },
  { id: "3", title: "Product Roadmap", kind: "pdf" as const, meta: "8 pages" },
  { id: "4", title: "Team Photo — Offsite", kind: "image" as const, meta: "PNG · 1.2 MB" },
];
