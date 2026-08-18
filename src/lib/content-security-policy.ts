export function storageOriginFromEndpoint(endpoint: string) {
  return new URL(endpoint).origin;
}

export function documentContentSecurityPolicy(storageOrigin: string) {
  return [
    "default-src 'self'",
    "img-src 'self' data:",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    // ADR-0018 keeps reads on this origin. ADR-0019 still PUTs to Garage, so the
    // storage origin must be listed or the browser never sends the bytes.
    `connect-src 'self' ${storageOrigin}`,
  ].join("; ");
}
