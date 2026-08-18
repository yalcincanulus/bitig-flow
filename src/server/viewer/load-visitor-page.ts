import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { findVisitorGate } from "./visitor-gate";

export const loadVisitorPage = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const gate = await findVisitorGate(data.slug);
    if (!gate) throw notFound();
    return gate;
  });
