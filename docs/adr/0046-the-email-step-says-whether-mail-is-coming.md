# The email step says whether mail is coming

The email step has two copies, and the server picks between them on `requires_verification`:

- **Capture only** — "The sender wants to know who opened this. No account, no password, and we won't email you."
- **Verification to follow** — "The sender wants to know who opened this. We'll send a 6-digit code here to check it's you."

A single copy covering both cases has to go quiet on the one thing the Visitor is deciding. Someone weighing whether to type a real address or a throwaway is asking exactly "does this reach my inbox", and a step that declines to answer teaches them the answer is yes. The two-copy split costs two strings: ADR-0033 already has the loader resolve the Requirement list before rendering, so the branch is a read of state the step already has.

Both copies name the sender rather than the system — the sender's name is on screen already (ADR-0045), so the ask reads as a person's request rather than a form's demand, which is what the capture actually is.

Neither copy calls this a login, and the step has no password field, no "sign in", and no account language. ADR-0002 makes unverified capture deliberately soft: a Visitor may type any address they like and the system may not treat it as an identity claim. Copy that implied otherwise would be describing a guarantee that does not exist. The wording promises exactly what the system does — the sender sees this next to your visit — and nothing about who you are.

The verification step that follows shows the address masked (`a•••••a@gmail.com`) rather than in full. The Visitor typed it moments ago so the masking costs them nothing, and it keeps a shoulder-surfed or shared screen from turning the Gate into a way to read back an address someone else entered.
