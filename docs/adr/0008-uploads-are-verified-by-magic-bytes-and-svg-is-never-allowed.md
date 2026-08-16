# Uploads are verified by magic bytes, and SVG is never allowed

Allowed upload types are `application/pdf`, `image/png`, `image/jpeg`, `image/webp`, and `image/gif`. **SVG is refused.** An SVG is an XML document that can carry `<script>`, and served from our own origin it would execute with our origin's privileges — the classic image-upload hole. The standard mitigation is a separate cookieless origin for user images, which is infrastructure this design doesn't have (one bucket, one origin).

PDFs can also embed JavaScript. That is acceptable here only because the viewer renders PDFs client-side with pdf.js, which does not execute embedded scripts — a raw `<iframe>` to the stored file would not be safe.

**The client-declared `Content-Type` is a claim, not evidence.** At upload confirmation the server reads the first bytes back from storage and checks the magic signature (`%PDF-`, PNG signature, JFIF/Exif, RIFF/WEBP, `GIF8`). The **sniffed** type is what gets persisted and set on the object; a mismatch means the object is deleted and the document never becomes ready.

**Size is capped at 25 MB, enforced after the fact.** A presigned PUT cannot constrain the body size, and switching to presigned POST with a `content-length-range` policy would mean reopening the storage design on a maybe about garage's support for it. Instead the existing confirmation step checks the object's size and deletes it if it is over. The known weakness: a client can waste bucket space between PUT and confirmation. That is acceptable because every uploader is an authenticated member of an organization, and it implies a sweeper for unconfirmed objects.

**Original filenames are data, sanitized at every point of use.** Control characters and path separators are stripped on capture and the name is capped at 255 characters; it is emitted in `Content-Disposition` as RFC 6266 `filename*=UTF-8''…` with an ASCII fallback. Storage keys are always `org/<orgId>/doc/<docId>/<file>` — the untrusted string never touches a path.

**No per-organization upload quota.** Every uploader is an invited member; the threat model is a careless colleague, not a hostile stranger. A quota is a product feature wearing a safety control's clothes.
