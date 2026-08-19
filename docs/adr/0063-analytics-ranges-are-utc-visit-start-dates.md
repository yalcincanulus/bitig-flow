# Analytics ranges are UTC Visit start dates

An analytics range filters `visit.started_at`, keeping every Event belonging to an included Visit instead of truncating its timeline. Dates are UTC, the end date includes its whole day through an exclusive next-midnight bound, and an absent range resolves on the server to today plus the preceding 29 dates so the default is a bounded 30 days.
