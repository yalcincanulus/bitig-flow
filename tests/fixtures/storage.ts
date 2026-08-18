import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { createStorageClients } from "#/server/storage-clients";

const { s3, bucket } = createStorageClients();

export async function putFixtureObject(key: string, body: Uint8Array, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function fixtureObjectExists(key: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error.name === "NotFound" || error.name === "NoSuchKey")
    ) {
      return false;
    }
    const status =
      typeof error === "object" &&
      error !== null &&
      "$metadata" in error &&
      typeof error.$metadata === "object" &&
      error.$metadata !== null &&
      "httpStatusCode" in error.$metadata
        ? error.$metadata.httpStatusCode
        : undefined;
    if (status === 404) return false;
    throw error;
  }
}
