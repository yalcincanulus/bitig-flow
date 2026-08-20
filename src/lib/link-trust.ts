export type LinkRequirements = {
  passwordSet: boolean;
  requiresEmail: boolean;
  requiresVerification: boolean;
};

const password = "Password";
const email = "Email";
const verifiedEmail = "Verified email";

/** Whether the Gate imposes anything at all. A Gate with no Requirements is public. */
export function hasRequirements(link: LinkRequirements) {
  return link.passwordSet || link.requiresEmail || link.requiresVerification;
}

/**
 * Whether a Link's analytics can be believed. A Link with no Requirements has no Gate to rate
 * limit, so anyone with the URL — including bots — can create Visits (ADR-0042).
 */
export function analyticsTrustworthy(link: LinkRequirements) {
  return hasRequirements(link);
}

/** The Requirements an owner can add to make a public Link's analytics believable (ADR-0042). */
export const trustRemedyRequirements = [password, email];

export type GateRequirementId = "password" | "email" | "verifiedEmail";

/**
 * The Link's Requirements, each carrying the identity behind its name, in the order they are
 * shown. The Gate is the one thing a reader scans a list of Links for, so the Dashboard shows it
 * as a badge per Requirement — and a badge needs to know which Requirement it is, not just how it
 * reads.
 */
export function gateRequirements(
  link: LinkRequirements,
): Array<{ id: GateRequirementId; label: string }> {
  const requirements: Array<{ id: GateRequirementId; label: string }> = [];
  if (link.passwordSet) requirements.push({ id: "password", label: password });
  if (link.requiresVerification) requirements.push({ id: "verifiedEmail", label: verifiedEmail });
  else if (link.requiresEmail) requirements.push({ id: "email", label: email });
  return requirements;
}

/** The Link's Requirements, named for a reader, in the order they are shown. */
export function gateRequirementNames(link: LinkRequirements) {
  return gateRequirements(link).map((requirement) => requirement.label);
}

/** The Requirements as one phrase, or "Public" when the Gate has none. */
export function gateSummary(link: LinkRequirements) {
  const names = gateRequirementNames(link);
  return names.length > 0 ? names.join(" and ") : "Public";
}
