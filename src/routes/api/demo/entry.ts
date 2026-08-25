import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { z } from "zod";

import { enterDemo, DemoEntryError } from "#/server/demo-entry";
import { demoEntryMiddleware } from "#/server/auth-middleware";

const noStoreHeaders = { "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/demo/entry")({
  server: {
    middleware: [demoEntryMiddleware],
    handlers: {
      POST: async ({ request }) => {
        const entryKey = z.uuid().safeParse(request.headers.get("x-demo-entry-key"));
        if (!entryKey.success) {
          return Response.json(
            { error: "Demo entry key is required" },
            { status: 400, headers: noStoreHeaders },
          );
        }
        try {
          const result = await enterDemo(request, entryKey.data);
          const headers = new Headers(noStoreHeaders);
          for (const cookie of result.setCookies) headers.append("Set-Cookie", cookie);
          return Response.json(result.body, { status: result.status, headers });
        } catch (error) {
          if (error instanceof DemoEntryError) {
            const status = error.reason === "durableSession" ? 409 : 503;
            return Response.json(
              { error: error.message, reason: error.reason },
              { status, headers: noStoreHeaders },
            );
          }
          console.error("Demo entry failed", error);
          return Response.json(
            { error: "Demo entry could not be completed" },
            { status: 500, headers: noStoreHeaders },
          );
        }
      },
    },
  },
});
