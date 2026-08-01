import { S3Client } from "@aws-sdk/client-s3";

function buildClient(endpoint: string | undefined): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION ?? "us-east-1",
    ...(endpoint && { endpoint, forcePathStyle: true }),
    ...(process.env.AWS_ACCESS_KEY_ID && {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    }),
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

// Internal client: server-side GetObject/PutObject against localhost.
export const s3 = buildClient(process.env.S3_ENDPOINT);

// Presign client: URLs must be reachable from the phone, so they are signed
// against the LAN-facing endpoint.
export const s3Presign = buildClient(
  process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT,
);

export const BUCKET = process.env.S3_BUCKET ?? "oneclicktrend-media";
