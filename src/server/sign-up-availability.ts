export type SignUpCapability = Readonly<{
  policyAllowsSignUp: boolean;
  mailAvailable: boolean;
  recoveryReady: boolean;
}>;

export function effectiveSignUpAvailability(capability: SignUpCapability) {
  return capability.policyAllowsSignUp && capability.mailAvailable && capability.recoveryReady;
}
