import { S3Client } from "@aws-sdk/client-s3";

import { resolveStorageEndpoints } from "#/lib/storage-endpoints";

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function createStorageClients() {
  const { endpoint, publicEndpoint } = resolveStorageEndpoints();
  const region = requiredEnvironmentVariable("S3_REGION");
  const credentials = {
    accessKeyId: requiredEnvironmentVariable("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironmentVariable("S3_SECRET_ACCESS_KEY"),
  } as const;

  return {
    s3: new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials,
    }),
    // A separate client for presigning: the SDK adds x-amz-checksum-* to SignedHeaders
    // by default, and a browser will not compute those, so the signature would never
    // match. WHEN_REQUIRED keeps them out of the URL. The public endpoint is the host
    // the browser can reach; S3_ENDPOINT stays the in-cluster Garage URL.
    presigner: new S3Client({
      endpoint: publicEndpoint,
      region,
      forcePathStyle: true,
      credentials,
      requestChecksumCalculation: "WHEN_REQUIRED" as const,
    }),
    bucket: requiredEnvironmentVariable("S3_BUCKET"),
  };
}
