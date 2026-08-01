import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { FACE_DIR } from "./lib/env";
import { detail, formatMs, info, ok, step, timer, warn } from "./lib/log";
import { IMAGE_EXTENSIONS, imageMimeType } from "./lib/media";
import {
  assertReady,
  createCharacter,
  getCharacter,
  pollUntilTerminal,
  ViggleApiError,
} from "./lib/viggle";

const CACHE_FILE = join(FACE_DIR, ".character.json");
const READY_TIMEOUT_MS = 5 * 60_000;

interface CacheEntry {
  characterId: string;
  imagePath: string;
  name: string;
  createdAt: string;
}

type Cache = Record<string, CacheEntry>;

export interface CharacterResult {
  characterId: string;
  imagePath: string;
  sha256: string;
  elapsedMs: number;
  cached: boolean;
}

/**
 * Creates a Viggle Character from the face photo, or reuses the one already made
 * for that exact file. Character creation costs 1 credit, and the reuse model is
 * what the app will rely on: upload your face once, render many trends with it.
 */
export async function ensureCharacter(
  options: { imagePath?: string; force?: boolean } = {},
): Promise<CharacterResult> {
  step("Preparing Viggle Character");

  const imagePath = options.imagePath ? resolve(options.imagePath) : await findFacePhoto();
  const bytes = await readFile(imagePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  info(`image: ${basename(imagePath)} (${sha256.slice(0, 12)})`);

  const cache = await readCache();
  const hit = cache[sha256];

  if (hit && !options.force) {
    const reusable = await stillUsable(hit.characterId);
    if (reusable) {
      ok(`Reusing Character ${hit.characterId} — created ${hit.createdAt}, no credit spent`);
      return { characterId: hit.characterId, imagePath, sha256, elapsedMs: 0, cached: true };
    }
    warn(`Cached Character ${hit.characterId} is gone from Viggle — creating a new one`);
    delete cache[sha256];
  }

  const elapsed = timer();
  const name = `oneclicktrend-${basename(imagePath)}`;
  const created = await createCharacter(
    { bytes, filename: basename(imagePath), contentType: imageMimeType(imagePath) },
    name,
  );
  detail(`created ${created.id} (${created.status})`);

  const character = await pollUntilTerminal(() => getCharacter(created.id), {
    label: "character",
    timeoutMs: READY_TIMEOUT_MS,
  });
  assertReady(character, "Character");

  if (!character.capabilities?.includes("video_render")) {
    throw new Error(
      `Character ${character.id} is ready but lacks the video_render capability ` +
        `(got: ${character.capabilities?.join(", ") || "none"}). It cannot drive a render.`,
    );
  }

  const elapsedMs = elapsed();
  cache[sha256] = {
    characterId: character.id,
    imagePath,
    name,
    createdAt: character.created_at ?? new Date().toISOString(),
  };
  await writeCache(cache);

  ok(`Character ${character.id} ready in ${formatMs(elapsedMs)} — capabilities: ${character.capabilities.join(", ")}`);
  detail(`cached in ${CACHE_FILE} so later runs reuse it for free`);

  return { characterId: character.id, imagePath, sha256, elapsedMs, cached: false };
}

async function stillUsable(characterId: string): Promise<boolean> {
  try {
    const character = await getCharacter(characterId);
    return character.status === "ready";
  } catch (error) {
    if (error instanceof ViggleApiError && error.status === 404) return false;
    throw error;
  }
}

/** Shared with pipeline v2, which needs the same photo as a Runway reference. */
export async function findFacePhoto(): Promise<string> {
  const entries = await readdir(FACE_DIR).catch(() => [] as string[]);
  const images = entries
    .filter((name) => IMAGE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)))
    .sort();

  if (images.length === 0) {
    throw new Error(
      `No image in ${FACE_DIR}. Drop a face photo there (${IMAGE_EXTENSIONS.join(", ")}) ` +
        "or pass --image /path/to/photo.jpg",
    );
  }
  if (images.length > 1) {
    warn(`${images.length} images in assets/face — using ${images[0]}. Pass --image to pick another.`);
  }
  return join(FACE_DIR, images[0]!);
}

async function readCache(): Promise<Cache> {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8")) as Cache;
  } catch {
    return {};
  }
}

async function writeCache(cache: Cache): Promise<void> {
  await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}
