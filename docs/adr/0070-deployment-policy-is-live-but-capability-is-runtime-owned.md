# Deployment Policy is live, but capability is runtime-owned

Mutable deployment-wide rules live in one app-owned **Deployment Policy** record so the **Platform Operator** can change demo admission, signup, and quotas without restarting the application. Secrets and capabilities such as outbound mail remain runtime-owned; policy may restrict a capability but can never claim an unavailable integration is ready.

This split keeps operational controls live without turning the database into a second secrets or deployment system. Missing or unreadable policy fails closed for new demo entry and signup, quota reductions block additional use without deleting existing data, and lower global admission limits never terminate environments that are already active.
