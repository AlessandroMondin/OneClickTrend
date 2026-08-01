import "dotenv/config";
import { randomUUID } from "crypto";
import { Readable } from "stream";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPrismaClient, MediaKind } from "@oneclicktrend/database";
import express from "express";

import { runAnimationJob } from "./animate";
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

app.patch("/characters/:id/media-order", wrap(async (req, res) => {
  const ids: string[] = req.body?.order ?? [];
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "order required" });
    return;
  }
  const owned = await prisma.mediaAsset.findMany({
    where: { id: { in: ids }, characterId: req.params.id },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    res.status(400).json({ error: "unknown media in order" });
    return;
  }
  await prisma.$transaction(
    ids.map((id, position) =>
      prisma.mediaAsset.update({ where: { id }, data: { position } }),
    ),
  );
  res.status(204).end();
}));

app.delete("/characters/:id", wrap(async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: { media: true },
  });
  if (!character) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await prisma.character.delete({ where: { id: character.id } });
  for (const asset of character.media) {
    try {
      await s3.send(
        new DeleteObjectCommand({ Bucket: BUCKET, Key: asset.s3Key }),
      );
    } catch (err) {
      apiLog(`WARN could not delete s3 object ${asset.s3Key}: ${err}`);
    }
  }
  res.status(204).end();
}));

app.delete("/media/:id", wrap(async (req, res) => {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: req.params.id },
  });
  if (!asset) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await prisma.mediaAsset.delete({ where: { id: asset.id } });
  try {
    await s3.send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: asset.s3Key }),
    );
  } catch (err) {
    // Row is gone; a leftover S3 object is harmless for local dev.
    apiLog(`WARN could not delete s3 object ${asset.s3Key}: ${err}`);
  }
  res.status(204).end();
}));

function sourceFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.includes("tiktok")) {
      return "tiktok";
    }
    if (host.includes("instagram")) {
      return "instagram";
    }
  } catch {
    // fall through
  }
  return "other";
}

// Short links (vm.tiktok.com) must be resolved to the full video URL first —
// TikTok's oEmbed endpoint rejects short links from non-browser clients.
async function resolveShortLink(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    const location = res.headers.get("location");
    if (location) {
      return location.split("?")[0];
    }
  } catch {
    // fall through
  }
  return url;
}

// TikTok's public oEmbed endpoint returns thumbnail + title for a video URL.
async function fetchOembed(
  url: string,
): Promise<{ title?: string; thumbnailUrl?: string }> {
  try {
    // oEmbed rejects /photo/ post URLs but accepts the same id as /video/.
    const resolved = (await resolveShortLink(url)).replace(
      "/photo/",
      "/video/",
    );
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(resolved)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) {
      return {};
    }
    const data = (await res.json()) as {
      title?: string;
      thumbnail_url?: string;
    };
    return { title: data.title, thumbnailUrl: data.thumbnail_url };
  } catch {
    return {};
  }
}

// The share extension posts shared URLs here; the app shows them in the
// Shared Links tab with an unread badge.
app.post("/shared-links", wrap(async (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!url) {
    res.status(400).json({ error: "url required" });
    return;
  }
  const source = sourceFromUrl(url);
  const meta = source === "tiktok" ? await fetchOembed(url) : {};
  const link = await prisma.sharedLink.create({
    data: { url, source, ...meta },
  });
  res.status(201).json(link);
}));

app.get("/shared-links", wrap(async (_req, res) => {
  const links = await prisma.sharedLink.findMany({
    orderBy: { createdAt: "desc" },
  });
  // Backfill source + thumbnails for links saved before enrichment existed.
  for (const link of links) {
    const source = sourceFromUrl(link.url);
    if (source === "tiktok" && (!link.thumbnailUrl || link.title === null)) {
      const meta = await fetchOembed(link.url);
      if (meta.thumbnailUrl || source !== link.source) {
        Object.assign(
          link,
          await prisma.sharedLink.update({
            where: { id: link.id },
            data: { source, ...meta },
          }),
        );
      }
    }
  }
  res.json(links);
}));

app.post("/shared-links/seen", wrap(async (_req, res) => {
  await prisma.sharedLink.updateMany({
    where: { seen: false },
    data: { seen: true },
  });
  res.status(204).end();
}));

app.delete("/shared-links/:id", wrap(async (req, res) => {
  await prisma.sharedLink.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

app.post("/shared-links/:id/animate", wrap(async (req, res) => {
  const characterId = String(req.body?.characterId ?? "");
  if (!characterId) {
    res.status(400).json({ error: "characterId required" });
    return;
  }
  const link = await prisma.sharedLink.findUnique({
    where: { id: req.params.id },
  });
  if (!link) {
    res.status(404).json({ error: "shared link not found" });
    return;
  }
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: {
      media: {
        where: { kind: MediaKind.PHOTO },
        orderBy: { position: "asc" },
        take: 1,
      },
    },
  });
  if (!character) {
    res.status(404).json({ error: "character not found" });
    return;
  }
  const photo = character.media[0];
  if (!photo) {
    res.status(400).json({ error: "character has no photo" });
    return;
  }

  const generation = await prisma.generation.create({
    data: {
      characterId: character.id,
      sharedLinkId: link.id,
      status: "running",
    },
  });
  // Fire and forget — status lands on the Generation row.
  runAnimationJob(generation.id, link, photo);
  res.status(201).json(generation);
}));

app.get("/generations/:id", wrap(async (req, res) => {
  const generation = await prisma.generation.findUnique({
    where: { id: req.params.id },
    include: {
      sharedLink: {
        select: { url: true, source: true, thumbnailUrl: true, title: true },
      },
    },
  });
  if (!generation) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(generation);
}));

app.delete("/generations/:id", wrap(async (req, res) => {
  const generation = await prisma.generation.findUnique({
    where: { id: req.params.id },
  });
  if (!generation) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await prisma.generation.delete({ where: { id: generation.id } });
  const keys = [
    ...(generation.outputS3Key ? [generation.outputS3Key] : []),
    ...(generation.soundS3Key ? [generation.soundS3Key] : []),
    ...(((generation.outputS3Keys as string[] | null) ?? [])),
  ];
  for (const key of keys) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch (err) {
      apiLog(`WARN could not delete s3 object ${key}: ${err}`);
    }
  }
  res.status(204).end();
}));

app.get("/generations/:id/photo/:index", wrap(async (req, res) => {
  const generation = await prisma.generation.findUnique({
    where: { id: req.params.id },
  });
  const keys = (generation?.outputS3Keys as string[] | null) ?? [];
  const key = keys[Number(req.params.index)];
  if (!key) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  res.setHeader("Content-Type", "image/png");
  if (obj.ContentLength != null) {
    res.setHeader("Content-Length", obj.ContentLength);
  }
  (obj.Body as Readable).pipe(res);
}));

app.get("/generations/:id/sound", wrap(async (req, res) => {
  const generation = await prisma.generation.findUnique({
    where: { id: req.params.id },
  });
  if (!generation?.soundS3Key) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const obj = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: generation.soundS3Key }),
  );
  res.setHeader("Content-Type", "audio/mpeg");
  if (obj.ContentLength != null) {
    res.setHeader("Content-Length", obj.ContentLength);
  }
  (obj.Body as Readable).pipe(res);
}));

app.get("/generations/:id/video", wrap(async (req, res) => {
  const generation = await prisma.generation.findUnique({
    where: { id: req.params.id },
  });
  if (!generation?.outputS3Key) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const range = req.headers.range;
  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: generation.outputS3Key,
      ...(range && { Range: range }),
    }),
  );
  res.status(range ? 206 : 200);
  res.setHeader("Content-Type", "video/mp4");
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
    include: {
      sharedLink: {
        select: { url: true, source: true, thumbnailUrl: true, title: true },
      },
    },
  });
  res.json(generations);
}));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
});
