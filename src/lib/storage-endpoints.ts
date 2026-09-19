export function trimStorageEndpoint(value: string) {
  return value.replace(/\/+$/, "");
}

export function resolveStorageEndpoints(environment: NodeJS.ProcessEnv = process.env) {
  const endpoint = environment.S3_ENDPOINT?.trim();
  if (!endpoint) throw new Error("S3_ENDPOINT is required");
  const configuredPublic = environment.S3_PUBLIC_ENDPOINT?.trim();
  return {
    endpoint: trimStorageEndpoint(endpoint),
    publicEndpoint: trimStorageEndpoint(configuredPublic || endpoint),
  };
}
