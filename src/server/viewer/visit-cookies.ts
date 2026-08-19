export const visitCookieName = "visit";
export const visitorIdCookieName = "visitor_id";
export const visitorIdCookiePath = "/";

export const visitTtlSeconds = 60 * 60 * 24 * 7;
export const visitorIdTtlSeconds = 60 * 60 * 24 * 400;

export function visitCookiePath(slug: string) {
  return `/v/${slug}`;
}
