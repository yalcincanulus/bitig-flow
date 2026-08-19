# The dwell accumulator is independent of the renderer

The Viewer's Dwell capture takes one input from whatever is on screen: a **page source**. Markdown and images pass `() => 1`. The PDF island will pass the page that IntersectionObserver currently names. The Dashboard **Preview** will pass nothing, because it is not a Visitor.

That is the same shape ADR-0059 gave `renderHtml()`: one parameter, so a second call site cannot drift by inventing a second argument. Capture does not import a renderer, and a renderer does not import capture. Swapping the PDF island therefore cannot change what a Beacon contains, and mounting the same PDF island on Preview cannot accidentally start a Beacon.

The accumulator itself is DOM-free. Timers, `visibilitychange`, and `navigator.sendBeacon` are wired by a hook that holds no logic. Tests drive the module with a fake `send` and a controlled `now`, which is the only way to see silent under-reporting — the failure mode no server-side assertion can catch.

The instance lives on the `/v` layout, one per page load, spanning Documents. A Vault navigation does not unmount it and does not flush; the document-keyed body (ADR-0027) already carries every Document the window collected. `currentDocument: null` on the Vault index and on the Gate, so those screens bank nothing.

## What this leaves open

The PDF island's IntersectionObserver is a later ticket. Until it exists, every arm passes `() => 1`, including PDF, and that is correct rather than incomplete: a PDF without pages is page 1 of 1 for capture purposes, the same way markdown is.
