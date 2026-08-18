import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const s3 = new S3Client({
  endpoint: required("S3_ENDPOINT"),
  region: required("S3_REGION"),
  forcePathStyle: true,
  credentials: {
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
  },
});

function bucket() {
  return required("S3_BUCKET");
}

export async function putFixtureObject(key: string, body: Uint8Array, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function fixtureObjectExists(key: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
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

export async function getFixtureObject(key: string) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return response.Body ? await response.Body.transformToByteArray() : new Uint8Array();
}

export async function deleteFixtureObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
