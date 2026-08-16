# Dwell is accumulated in the client and Redis is not in its path

The viewer holds one accumulator, not a set of enter/exit pairs. IntersectionObserver names a single **current page** — the one with the greatest intersection ratio — and a 1s `setInterval` adds to that page's counter. The accumulated map is beaconed every **15s**, and once more on `visibilitychange → hidden` with `keepalive`. The interval is paused while `document.hidden`, so a backgrounded tab accrues nothing.

Enter/exit pairs are the wrong model because their correctness depends on the exit event, and the exit event is exactly what goes missing when a tab is closed, backgrounded on mobile, or crashed. An accumulator that has already banked its milliseconds loses at most the last unflushed window.

A page's dwell is capped **server-side at 30 minutes per `(document, page)` per visit**. Pausing on `hidden` handles the common case; the cap handles a genuinely pinned foreground tab on a second monitor, so no visit can ever report six hours of reading.

**Redis is not in the dwell path.** The map assumed at charting that dwell would arrive as a firehose needing a buffer; the client accumulator makes that false, so the buffer would sit behind another buffer and collapse perhaps four rows into one. Each beacon instead appends its `page_dwell` rows straight to Postgres. A visitor reading a 20-page PDF for ten minutes produces roughly fifty rows, which at this scale is nothing.

What that buys is an answer to "what is lost if Redis restarts" that we can give straight: live gates and granted visits, both of which were already volatile and already accepted — and **zero** dwell. The alternative cost sixty seconds of dwell plus a flush trigger, a TTL, and a sweeper for visits that die mid-read, each of which is a thing to write and test.

Redis keeps the jobs ADR-0003 and ADR-0004 gave it — in-progress gate state, the granted visit record, the 6-digit code, attempt counters — and gains only beacon rate limiting and de-duplication (ADR-0027). If traffic ever justified a dwell buffer, adding one is strictly additive: it changes neither the event vocabulary nor the read side.
