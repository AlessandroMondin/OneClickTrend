import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { MediaAsset, SharedLink } from "@oneclicktrend/database";
import { createPrismaClient } from "@oneclicktrend/database";

import { apiLog } from "./logging";
import { BUCKET, s3 } from "./s3";

const prisma = createPrismaClient();

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCRIPTS_OUT = path.join(REPO_ROOT, "scripts", "out");
const LOG_DIR = path.join(REPO_ROOT, "logs");

function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
  };
  return map[mimeType] ?? ".jpg";
}

// nvm-installed node 22 is required by the scripts package; the API itself may
// have been started from a different node.
function node22Path(): string {
  const base = path.join(os.homedir(), ".nvm", "versions", "node");
  try {
    const version = fs
      .readdirSync(base)
      .filter((v) => v.startsWith("v22"))
      .sort()
      .pop();
    if (version) {
      return path.join(base, version, "bin");
    }
  } catch {
    // fall through
  }
  return "";
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

function runPipeline(url: string, imagePath: string, logPath: string): Promise<number> {
  return new Promise((resolvePromise) => {
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    const env = {
      ...process.env,
      PATH: `${node22Path()}:${process.env.PATH ?? ""}`,
    };
    const child = spawn(
      "pnpm",
      ["--filter", "@oneclicktrend/scripts", "pipeline", url, "--image", imagePath],
      { cwd: REPO_ROOT, env },
    );
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);
    child.on("close", (code) => {
      logStream.end();
      resolvePromise(code ?? 1);
    });
    child.on("error", (err) => {
      logStream.write(`spawn failed: ${err.message}\n`);
      logStream.end();
      resolvePromise(1);
    });
  });
}

function findRenderVideo(startedAt: number): string | null {
  try {
    for (const dir of fs.readdirSync(SCRIPTS_OUT)) {
      const reportPath = path.join(SCRIPTS_OUT, dir, "report.json");
      if (!fs.existsSync(reportPath)) {
        continue;
      }
      if (fs.statSync(reportPath).mtimeMs < startedAt) {
        continue;
      }
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      const video = report?.outputs?.renderVideo;
      if (typeof video === "string") {
        const abs = path.isAbsolute(video)
          ? video
          : path.join(REPO_ROOT, "scripts", video);
        if (fs.existsSync(abs)) {
          return abs;
        }
      }
    }
  } catch {
    // fall through
  }
  return null;
}

async function fail(generationId: string, logPath: string, reason: string) {
  let tail = reason;
  try {
    const log = await fs.promises.readFile(logPath, "utf8");
    tail = `${reason}\n${log.slice(-500)}`;
  } catch {
    // keep reason only
  }
  await prisma.generation.update({
    where: { id: generationId },
    data: { status: "failed", error: tail.slice(0, 1000) },
  });
  apiLog(`animate ${generationId} failed: ${reason}`);
}

export async function runAnimationJob(
  generationId: string,
  link: SharedLink,
  photo: MediaAsset,
): Promise<void> {
  const startedAt = Date.now();
  const logPath = path.join(LOG_DIR, `animate-${generationId}.log`);
  apiLog(`animate ${generationId} started for ${link.url}`);

  try {
    const imagePath = await downloadCharacterPhoto(photo);
    const exitCode = await runPipeline(link.url, imagePath, logPath);
    if (exitCode !== 0) {
      await fail(generationId, logPath, `pipeline exited with code ${exitCode}`);
      return;
    }

    const videoPath = findRenderVideo(startedAt);
    if (!videoPath) {
      await fail(generationId, logPath, "pipeline succeeded but no render video found");
      return;
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
    await fail(generationId, logPath, err instanceof Error ? err.message : String(err));
  }
}
