# Gates are composable requirements, not an access-level enum

The product speaks of four access levels — public, password, email-required, email-verified — but we store them as independent columns (`password_hash`, `requires_email`, `requires_verification`) rather than a single enum, and fold them into an ordered requirement list at read time.

The enum cannot express "password **and** tell me who you are", which is a combination owners genuinely want. The cost of composability is representable nonsense (verification without email), which one CHECK constraint eliminates. The dashboard still presents the four familiar levels as presets over the flags, so the enum survives as UI vocabulary without becoming a schema constraint.

The requirement order is fixed: **password → email → code**, one screen per step. Password is checked first so that we never collect someone's email address and only then tell them their password was wrong.

**Email capture without verification is deliberately soft.** A visitor can type any address they like. `requires_email` is lead capture, not authentication, and no part of the system may treat an unverified captured email as an identity claim.
