import { auth } from "#/server/auth";
import { demoSessionAvailability } from "#/server/repositories/demo-lifecycle";

function unavailableDemoResponse() {
  return Response.json(
    {
      code: "DEMO_ENVIRONMENT_UNAVAILABLE",
      message: "Demo Environment is unavailable",
    },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}

export async function handleAuthRequest(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.isAnonymous) {
    const availability = await demoSessionAvailability(session.user.id);
    if (!availability.available) return unavailableDemoResponse();
    if (request.method !== "GET") return unavailableDemoResponse();
  }
  return auth.handler(request);
}
