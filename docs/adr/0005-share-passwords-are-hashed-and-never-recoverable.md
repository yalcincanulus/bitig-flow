# Share passwords are hashed and never recoverable

A link's password is stored as an argon2id hash. The dashboard can report that a password is set and can replace it, but can never show it.

Comparable products display the share password back to the owner, which is genuinely more useful — owners forget what they sent a client. We are trading that convenience for the principle: a recoverable share password makes this app a credential store. Replacing a password bumps `gate_version`, so live visits that entered under the old one are re-gated immediately.
