export type LinkRequirements = {
  passwordSet: boolean;
  requiresEmail: boolean;
  requiresVerification: boolean;
};

export type LinkTrust = {
  /** Whether the Link's Gate rate limits enough for its analytics to be believed (ADR-0042). */
  trustworthy: boolean;
  /** The Link's Requirements, named for a reader, in the order they are shown. */
  requirements: string[];
  /** The Requirements as one phrase, or "Public" when there are none. */
  summary: string;
};

export function linkTrust(link: LinkRequirements): LinkTrust {
  const requirements = [];
  if (link.passwordSet) requirements.push("Password");
  if (link.requiresVerification) requirements.push("Verified email");
  else if (link.requiresEmail) requirements.push("Email");

  return {
    trustworthy: requirements.length > 0,
    requirements,
    summary: requirements.length > 0 ? requirements.join(" and ") : "Public",
  };
}
