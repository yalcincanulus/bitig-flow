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

/** The Link's Requirements, named for a reader, in the order they are shown. */
export function gateRequirementNames(link: LinkRequirements) {
  const names = [];
  if (link.passwordSet) names.push(password);
  if (link.requiresVerification) names.push(verifiedEmail);
  else if (link.requiresEmail) names.push(email);
  return names;
}

/** The Requirements as one phrase, or "Public" when the Gate has none. */
export function gateSummary(link: LinkRequirements) {
  const names = gateRequirementNames(link);
  return names.length > 0 ? names.join(" and ") : "Public";
}
