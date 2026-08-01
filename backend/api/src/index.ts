import "dotenv/config";
import { randomUUID } from "crypto";
import { Readable } from "stream";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPrismaClient, MediaKind } from "@oneclicktrend/database";
import express from "express";

import { apiLog, appLog, requestLogger } from "./logging";
import { BUCKET, s3, s3Presign } from "./s3";

const prisma = createPrismaClient();
const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(requestLogger());

// Device console.log / JS errors land here → logs/app.log.
app.post("/logs", (req, res) => {
  appLog(`[${req.body?.level ?? "log"}] ${req.body?.message ?? ""}`);
  res.status(204).end();
});

// Express 4 doesn't catch async errors — an unhandled rejection kills the
// process. Every async route goes through this wrapper.
type Handler = (req: express.Request, res: express.Response) => Promise<void>;
const wrap =
  (fn: Handler): express.RequestHandler =>
  (req, res) => {
    fn(req, res).catch((err) => {
      console.error(`${req.method} ${req.path} failed:`, err);
      apiLog(`ERROR ${req.method} ${req.path}: ${err?.stack ?? err}`);
      if (!res.headersSent) {
        res.status(500).json({ error: "internal error" });
      }
    });
  };

app.get("/hello", (_req, res) => {
  res.json({ message: "hello world" });
});

app.get("/characters", wrap(async (_req, res) => {
  const characters = await prisma.character.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { media: true } },
      media: {
        where: { kind: MediaKind.PHOTO },
        orderBy: { position: "asc" },
        take: 1,
      },
    },
  });
  res.json(
    characters.map(({ media, ...c }) => ({
      ...c,
      thumbnailUrl: media[0] ? `/media/${media[0].id}` : null,
    })),
  );
}));

app.post("/characters", wrap(async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const character = await prisma.character.create({ data: { name } });
  res.status(201).json(character);
}));

app.get("/characters/:id", wrap(async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: { media: { orderBy: [{ kind: "asc" }, { position: "asc" }] } },
  });
  if (!character) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({
    ...character,
    media: character.media.map((m) => ({ ...m, url: `/media/${m.id}` })),
  });
}));

app.post("/characters/:id/media", wrap(async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
  });
  if (!character) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const files: Array<{
    filename?: string;
    contentType?: string;
    position?: number;
  }> = req.body?.files ?? [];
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "files required" });
    return;
  }

  // Limits: up to 4 pictures and 1 video per character.
  const isVideo = (f: { contentType?: string }) =>
    (f.contentType ?? "").startsWith("video/");
  const existing = await prisma.mediaAsset.groupBy({
    by: ["kind"],
    where: { characterId: character.id },
    _count: true,
  });
  const count = (kind: MediaKind) =>
    existing.find((e) => e.kind === kind)?._count ?? 0;
  const newPhotos = files.filter((f) => !isVideo(f)).length;
  const newVideos = files.filter(isVideo).length;
  if (count(MediaKind.PHOTO) + newPhotos > 4) {
    res.status(400).json({ error: "max 4 pictures per character" });
    return;
  }
  if (count(MediaKind.VIDEO) + newVideos > 1) {
    res.status(400).json({ error: "max 1 video per character" });
    return;
  }

  const created = [];
  for (const file of files) {
    const filename = file.filename ?? "media";
    const contentType = file.contentType ?? "application/octet-stream";
    const s3Key = `characters/${character.id}/${randomUUID()}-${filename}`;

    const asset = await prisma.mediaAsset.create({
      data: {
        characterId: character.id,
        kind: isVideo(file) ? MediaKind.VIDEO : MediaKind.PHOTO,
        s3Key,
        mimeType: contentType,
        position: Number.isInteger(file.position) ? file.position! : 0,
      },
    });

    const uploadUrl = await getSignedUrl(
      s3Presign,
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        ContentType: contentType,
      }),
      { expiresIn: 900 },
    );

    created.push({ id: asset.id, kind: asset.kind, uploadUrl });
  }

  res.status(201).json(created);
}));

app.get("/media/:id", wrap(async (req, res) => {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: req.params.id },
  });
  if (!asset) {
    res.status(404).json({ error: "not found" });
    return;
  }

  // Pass Range through so AVPlayer can seek while streaming video.
  const range = req.headers.range;
  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: asset.s3Key,
      ...(range && { Range: range }),
    }),
  );

  res.status(range ? 206 : 200);
  res.setHeader("Content-Type", asset.mimeType);
  res.setHeader("Accept-Ranges", "bytes");
  if (obj.ContentLength != null) {
    res.setHeader("Content-Length", obj.ContentLength);
  }
  if (obj.ContentRange) {
    res.setHeader("Content-Range", obj.ContentRange);
  }
  (obj.Body as Readable).pipe(res);
}));

app.get("/generations", wrap(async (_req, res) => {
  const generations = await prisma.generation.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(generations);
}));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
});
