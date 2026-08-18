import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { isUploadOverSizeCap, uploadMaxBytes } from "#/lib/upload";

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function storageConfig() {
  return {
    endpoint: requiredEnvironmentVariable("S3_ENDPOINT"),
    region: requiredEnvironmentVariable("S3_REGION"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnvironmentVariable("S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnvironmentVariable("S3_SECRET_ACCESS_KEY"),
    },
  } as const;
}

const s3 = new S3Client(storageConfig());
const presigner = new S3Client({
  ...storageConfig(),
  requestChecksumCalculation: "WHEN_REQUIRED",
});

function bucket() {
  return requiredEnvironmentVariable("S3_BUCKET");
}

export type StoredObject = Readonly<{
  bytes: Uint8Array;
  oversized: boolean;
}>;

function isMissingObject(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error ? error.name : undefined;
  const code =
    "Code" in error && typeof error.Code === "string"
      ? error.Code
      : "$metadata" in error &&
          typeof error.$metadata === "object" &&
          error.$metadata !== null &&
          "httpStatusCode" in error.$metadata
        ? error.$metadata.httpStatusCode
        : undefined;
  return name === "NoSuchKey" || name === "NotFound" || code === "NoSuchKey" || code === 404;
}

export async function getStoredObject(key: string): Promise<StoredObject | undefined> {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (response.ContentLength !== undefined && response.ContentLength > uploadMaxBytes) {
      return { bytes: new Uint8Array(), oversized: true };
    }
    const bytes = response.Body ? await response.Body.transformToByteArray() : new Uint8Array();
    return { bytes, oversized: isUploadOverSizeCap(bytes.byteLength) };
  } catch (error) {
    if (isMissingObject(error)) return undefined;
    throw error;
  }
}

export async function deleteStoredObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export function presignPutObject(key: string) {
  return getSignedUrl(presigner, new PutObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: 15 * 60,
  });
}

export async function putStoredObject(key: string, body: Uint8Array, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}
