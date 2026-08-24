# Demo budgets are durable and atomically reserved

Authoritative **Demo Environment** usage, reservations, and lifetime counters live in Postgres and every bounded write uses an atomic conditional update. Redis remains responsible only for best-effort IP admission and short-window request pressure; restarting it must not restore storage, egress, upload, Visit, or Event capacity.

This deliberately differs from the Gate counters in ADR-0037. Those counters are temporary abuse speed bumps whose reset shares Gate state loss, while Demo budgets protect finite deployment resources for the complete 24-hour lifetime. Upload size is reserved before an **Upload key** is issued and reconciled at **Confirmation**; byte delivery is charged before streaming; and Visit or Event insertion succeeds only while its durable ceiling has capacity.
