# Image bytes are stored and served exactly as uploaded

**No thumbnails, no derivatives.** Dashboard cards and the viewer both request the original through the proxy of ADR-0018 and let the browser scale it. Generating derivatives would mean a native `sharp` dependency, a second object per document, a second key convention against the one-object-per-document rule of ADR-0019, and a regeneration story — for a grid of cards at portfolio traffic under a 25 MB cap.

**This is deliberately entangled with EXIF stripping rather than separated from it.** Uploads are verified by magic bytes but stored as-is (ADR-0008), so a photograph keeps its GPS metadata. Both thumbnails and EXIF stripping are answered by the same capability — re-encoding image bytes on the server — and if that capability is ever added it should be decided once, as a single "do we process image bytes at all" question, rather than arriving twice through two unrelated tickets.
