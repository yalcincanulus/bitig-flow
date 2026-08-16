# A visitor's IP is a best-effort key and never the only control

Every per-IP limit on the Gate reads the client address from a single `getClientIp()` helper that takes the rightmost trustworthy `X-Forwarded-For` hop, with the number of proxies in front of us fixed by configuration; in development it degrades to the socket address. In production the app sits behind Coolify's Traefik, so the socket address is the proxy — and `X-Forwarded-For` is a header the client can also send, so only the hop our own proxy appended is believable.

Even a correctly derived address is a blunt key. An office behind one NAT is a single bucket; a phone rotating IPv6 prefixes is many; a proxy pool is unlimited. So an IP-keyed counter is a speed bump on a casual attacker and nothing more, and no control whose failure has a victim outside our system may rest on one alone — see ADR-0038 and ADR-0039 for where that rule bites.

When the header is absent or unparseable in production, requests share one `unknown` bucket rather than bypassing the limiter. That is deliberately uncomfortable: a misconfigured proxy count degrades into a shared limit that someone will notice, which is preferable to silently disabling every control.
