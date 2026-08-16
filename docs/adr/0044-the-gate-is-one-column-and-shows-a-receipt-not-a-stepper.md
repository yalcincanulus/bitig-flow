# The gate is one column and shows a receipt, not a stepper

The Gate renders as a single left-aligned column, capped around 26rem, top-anchored, with no card, no panel, and no layout that changes between a phone and a desktop. Controls are full-width. The only thing above the question is the wordmark and the sender line (ADR-0045).

Three variants were built and compared (issue #15): a centred card leading with the sender's avatar, a split context rail with an explicit "Step 2 of 3", and this one. The split rail loses because the Gate has almost nothing to put in a rail once ADR-0045 removes the target's title — a persistent panel carrying "4 documents" and an expiry date is furniture around a single input. The card loses because it is a desktop shape that has to be redesigned for the width these links are actually opened at.

Progress is shown as a **receipt** — a list of what the Visitor has already satisfied ("Password accepted", then their captured address) — rather than a stepper naming the steps ahead. A stepper has to be honest about the count, which means printing "Verify email" to someone who has not yet passed the password, which is a small preview of the gate's shape to anyone holding the Slug. The receipt only ever describes what the Visitor themselves has done, so it leaks nothing, and it degrades correctly for the common single-requirement Link where a "Step 1 of 1" stepper is noise.

The receipt also matches how the server actually works: ADR-0033 has the loader return the Requirements still _unsatisfied_ and re-derive the step on every submission. Rendering satisfied state is reading a value the loader already holds; rendering a total step count is asking it a question it was not designed to answer.

One consequence for the Vault list behind the Gate: it inherits the same column and the same left alignment, so passing the Gate widens nothing and moves nothing. The empty-Vault state is one line of prose in that column ("There's nothing in here yet"), not an illustrated empty state — a Visitor cannot act on it, and the only party who can is not present.

The prototype is on the `prototype/visitor-gate-flow` branch and is not production code.
