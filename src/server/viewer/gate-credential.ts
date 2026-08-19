import { createMiddleware } from "@tanstack/react-start";

export const gateCredential = createMiddleware().server(async ({ next }) => next());
