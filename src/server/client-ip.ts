import { isIP } from "node:net";

export function getClientIp(options: {
  headers: Headers;
  trustedProxyCount: number;
  socketAddress?: string;
}) {
  if (options.trustedProxyCount === 0) {
    return options.socketAddress && isIP(options.socketAddress) ? options.socketAddress : "unknown";
  }

  const forwarded = options.headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";

  const hops = forwarded
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  const client = hops[hops.length - options.trustedProxyCount];
  if (!client || !isIP(client)) return "unknown";
  return client;
}
