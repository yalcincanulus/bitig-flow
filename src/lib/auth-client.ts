import { createAuthClient } from "better-auth/react";
import {
  anonymousClient,
  emailOTPClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";

import { organizationPluginOptions } from "./access-control";

export const authClient = createAuthClient({
  plugins: [
    anonymousClient(),
    organizationClient(organizationPluginOptions),
    emailOTPClient(),
    twoFactorClient({ twoFactorPage: "/two-factor" }),
  ],
});
