import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { operatorMiddleware } from "#/server/auth-middleware";
import { mailCapabilityAvailable } from "#/server/email-config";
import { getEmailTransport } from "#/server/email";

const noStoreHeaders = { "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/operations/mail/test")({
  server: {
    middleware: [operatorMiddleware],
    handlers: {
      POST: async ({ context }) => {
        if (!mailCapabilityAvailable()) {
          return Response.json(
            { error: "Mail is unavailable" },
            { status: 503, headers: noStoreHeaders },
          );
        }

        const sentTo = context.authSession.user.email;
        try {
          await getEmailTransport().send({
            to: sentTo,
            subject: "bitig-flow Operations test email",
            text: "Mail delivery from bitig-flow Operations is working.",
          });
          return Response.json({ sentTo }, { headers: noStoreHeaders });
        } catch {
          return Response.json(
            { error: "Test email could not be sent" },
            { status: 502, headers: noStoreHeaders },
          );
        }
      },
    },
  },
});
