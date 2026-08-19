/** Bitcoin base58: 12 characters, no 0/O/I/l. */
export const linkSlugAlphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const linkSlugLength = 12;

export const pendingLinkSlug = ".".repeat(linkSlugLength);

export function linkViewerPath(slug: string) {
  return `/v/${slug}`;
}

const linkSlugPattern = /^[1-9A-HJ-NP-Za-km-z]{12}$/;

export function isLinkSlug(value: string) {
  return linkSlugPattern.test(value);
}

export function mintLinkSlug(bytes: Uint8Array) {
  if (bytes.length < linkSlugLength) {
    throw new Error("Need 12 random bytes to mint a Slug");
  }

  let slug = "";
  for (let index = 0; index < linkSlugLength; index++) {
    slug += linkSlugAlphabet[bytes[index]! % linkSlugAlphabet.length];
  }
  return slug;
}
