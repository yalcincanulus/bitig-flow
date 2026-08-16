# Analytics identifiers are salted and are never credentials

`visit.ip_hash` is `sha256(ANALYTICS_SALT + ip)` with a single per-deployment salt read from the environment. A per-link salt would make an IP linkable only within one link, which destroys the hash's only real job: spotting one address hammering many links, the input the gate abuse policy needs. `visit.user_agent` is stored raw — it is low-value and hashing it would be theatre.

`visit.email` is stored in plaintext deliberately. Lead capture is the product; encrypting the thing the dashboard exists to display would protect nothing.

Neither `visitor_id` nor `ip_hash` ever grants access. ADR-0003 already forbids the tempting shortcut — a returning visitor recognised by cookie still walks the whole gate — and this is the same rule stated from the data side: the moment a long-lived analytics identifier can skip a step, that identifier *is* the credential.

**No retention or purge job.** This is a portfolio demo with no traffic, and a scheduled purge nobody exercises is worse than an honest note. A real deployment would expire visits and their events at around twelve months; recording that here is more truthful than shipping a job that has never run.
