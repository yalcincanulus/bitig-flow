export const visitCookieName = "visit";
export const visitorIdCookieName = "visitor_id";
export const gateProgressCookieName = "gate";
export const visitorIdCookiePath = "/";

export const visitTtlSeconds = 60 * 60 * 24 * 7;
export const visitorIdTtlSeconds = 60 * 60 * 24 * 400;
export const gateProgressTtlSeconds = 15 * 60;

export function visitCookiePath(slug: string) {
  return `/v/${slug}`;
}

export function cookieOptions(path: string, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path,
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}
