# Unconfirmed uploads never use the final Storage key

Every upload first receives a random, short-lived **Upload key**. **Confirmation** validates those staged bytes, writes the verified result to the Document's immutable **Storage key**, commits actual usage, and removes the Upload key; abandoned staging objects are reaped later.

Presigning the final Storage key let a retained PUT URL overwrite a ready Document after Confirmation, contradicting ADR-0020 while authenticated uploaders were assumed to be trusted. A shorter URL lifetime only narrows that race. Separating staged from confirmed bytes closes it and provides the reservation boundary required for hostile Demo Users, at the cost of a second object write during Confirmation.
