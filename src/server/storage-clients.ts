import { S3Client } from "@aws-sdk/client-s3";

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function createStorageClients() {
  const config = {
    endpoint: requiredEnvironmentVariable("S3_ENDPOINT"),
    region: requiredEnvironmentVariable("S3_REGION"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnvironmentVariable("S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnvironmentVariable("S3_SECRET_ACCESS_KEY"),
    },
  } as const;

  return {
    s3: new S3Client(config),
    // A separate client for presigning: the SDK adds x-amz-checksum-* to SignedHeaders
    // by default, and a browser will not compute those, so the signature would never
    // match. WHEN_REQUIRED keeps them out of the URL.
    presigner: new S3Client({
      ...config,
      requestChecksumCalculation: "WHEN_REQUIRED" as const,
    }),
    bucket: requiredEnvironmentVariable("S3_BUCKET"),
  };
}
