# A visitor is never a user

Email verification at a gate uses a 6-digit code issued by our own mechanism in Redis — not Better Auth's `emailOTP` plugin, and not by creating an account for the visitor.

Better Auth's OTP flow exists to authenticate *users*, and bending it to cover anonymous visitors would write every stranger who ever typed an email into a share form into the auth tables, quietly turning lead capture into an account-creation endpoint. Keeping the two apart costs us a small amount of duplicated code (code generation, hashing, attempt counting) and buys a boundary that is otherwise very easy to erode.

Concretely: 6 digits, stored hashed, 10 minute TTL, maximum 5 attempts, resend permitted after 60 seconds. Broader abuse policy — IP-level rate limiting across links — is a separate decision.

The same boundary rules out cookie-based shortcuts: a returning visitor whose `visitor_id` is recognised, and who verified the same email on the same link last week, still walks the entire gate again. The moment a long-lived analytics cookie can skip a verification step, that cookie *is* the credential.
