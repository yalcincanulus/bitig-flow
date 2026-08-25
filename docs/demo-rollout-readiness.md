# Demo rollout readiness

The deployed default keeps Demo entry and signup closed. A migration never opens either public surface.

The Platform Operator controls rollout through **Operations → Deployment Policy**. Runtime capability remains authoritative when the requested Deployment Policy is open.

## Domain decisions

- A Demo User owns one disposable Organization in one Demo Environment (ADR-0069).
- The Deployment Policy can restrict runtime capability, but it cannot create capability (ADR-0070).
- Operations is global and Organization-blind (ADR-0071).
- An Upload key is separate from the final Storage key (ADR-0072).
- Postgres owns durable Demo budgets and reservations (ADR-0073).
- Every termination reason uses the same resumable operation (ADR-0074).

## Demo entry procedure

1. Apply all database migrations.
2. Bootstrap the Platform Operator with `pnpm operator:bootstrap`.
3. Enroll the Platform Operator in TOTP.
4. Schedule `pnpm reaper` at least every 15 minutes.
5. Schedule `pnpm sweep` for storage reconciliation.
6. Schedule `pnpm summary-fold` once per day.
7. Open **Operations → Deployment Policy**.
8. Make sure that these readiness rows show **Ready**:
   - Database
   - Redis
   - Storage
   - Sweep
   - Reaper
   - Trusted proxy
   - HTTPS transport
   - Secure Session cookies
   - Operator TOTP
   - Deployment Policy
9. Run `pnpm typecheck`.
10. Run `pnpm test`.
11. Select **Accept new demos**.
12. Save the Deployment Policy.
13. Open the homepage in a signed-out browser.
14. Make sure that **Try the demo** is the primary action.
15. Enter a Demo Environment and use the Sample resources.
16. End the Demo and make sure that the homepage replaces the Dashboard.

The server refuses the save if a required Demo readiness row is not ready. Existing Demo Environments do not become durable.

## Signup procedure

1. Complete the Demo entry procedure.
2. Make sure that **Mail and recovery** shows **Ready**.
3. Send a test message from Operations.
4. Complete one password-reset journey.
5. Select **Enable durable signup**.
6. Save the Deployment Policy.
7. Make sure that **Create account** is visible on the homepage.

The server refuses direct signup when effective signup availability is closed. This repository does not configure an external mail provider.

## Close or pause access

To stop new Demo Environments, clear **Accept new demos** and save the Deployment Policy.

To stop all Demo access, select **Pause all demo access** and save the Deployment Policy.

Use **Delete all Demo Environments** only for a fleet reset. This action removes active Demo data and keeps content-free aggregate records.

After a fleet reset, run the Reaper and the Sweep. Then make sure that both maintenance rows show **Ready**.

## Scope

This rollout does not configure CAPTCHA, a CDN, an object lifecycle policy, an external mail provider, or a production deployment.
