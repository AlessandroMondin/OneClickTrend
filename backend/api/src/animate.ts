import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { MediaAsset, SharedLink } from "@oneclicktrend/database";
import { createPrismaClient } from "@oneclicktrend/database";

import { apiLog } from "./logging";
import { runPipeline } from "./pipeline/pipeline";
import { BUCKET, s3 } from "./s3";

const prisma = createPrismaClient();

function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
  };
  return map[mimeType] ?? ".jpg";
}

async function downloadCharacterPhoto(photo: MediaAsset): Promise<string> {
  const obj = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: photo.s3Key }),
  );
  const tmp = path.join(
    os.tmpdir(),
    `oneclicktrend-face-${photo.id}${extensionFor(photo.mimeType)}`,
  );
  const bytes = Buffer.from(
    await (obj.Body as Readable & { transformToByteArray(): Promise<Uint8Array> })
      .transformToByteArray(),
  );
  await fs.promises.writeFile(tmp, bytes);
  return tmp;
}

export async function runAnimationJob(
  generationId: string,
  link: SharedLink,
  photo: MediaAsset,
): Promise<void> {
  apiLog(`animate ${generationId} started for ${link.url}`);

  try {
    const imagePath = await downloadCharacterPhoto(photo);
    const report = await runPipeline(link.url, { imagePath });

    const videoPath = report.outputs.renderVideo;
    if (!videoPath || !fs.existsSync(videoPath)) {
      throw new Error("pipeline finished but produced no render video");
    }

    const outputS3Key = `renders/${generationId}.mp4`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: outputS3Key,
        Body: await fs.promises.readFile(videoPath),
        ContentType: "video/mp4",
      }),
    );
    await prisma.generation.update({
      where: { id: generationId },
      data: { status: "completed", outputS3Key },
    });
    apiLog(`animate ${generationId} completed -> ${outputS3Key}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.generation.update({
      where: { id: generationId },
      data: { status: "failed", error: message.slice(0, 1000) },
    });
    apiLog(`animate ${generationId} failed: ${message}`);
  }
}
