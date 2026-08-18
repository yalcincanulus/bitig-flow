export function storageOriginFromEndpoint(endpoint: string) {
  return new URL(endpoint).origin;
}

export function isViewerPath(pathname: string) {
  return pathname === "/v" || pathname.startsWith("/v/");
}

const documentPolicy = [
  "default-src 'self'",
  "img-src 'self' data:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
] as const;

export function documentContentSecurityPolicy(storageOrigin: string) {
  return [
    ...documentPolicy,
    // ADR-0018 keeps reads on this origin. ADR-0019 still PUTs to Garage, so the
    // storage origin must be listed or the browser never sends the bytes.
    `connect-src 'self' ${storageOrigin}`,
  ].join("; ");
}

export function viewerContentSecurityPolicy() {
  return [...documentPolicy, "connect-src 'self'"].join("; ");
}
