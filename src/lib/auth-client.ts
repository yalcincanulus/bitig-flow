import { createAuthClient } from "better-auth/react";
import { emailOTPClient, organizationClient } from "better-auth/client/plugins";

import { organizationPluginOptions } from "./access-control";

export const authClient = createAuthClient({
  plugins: [organizationClient(organizationPluginOptions), emailOTPClient()],
});
