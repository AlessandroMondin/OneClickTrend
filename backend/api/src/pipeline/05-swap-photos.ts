import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { carouselImageUrls } from "./01-fetch-tiktok";
import type { TikTokItem } from "./lib/apify";
import { editImage } from "./lib/gemini";
import { detail, formatMs, info, ok, step, timer } from "./lib/log";
import { imageMimeType } from "./lib/media";
import { FILES, runDir } from "./lib/run-store";

const SWAP_PROMPT =
  "Replace the face of the person in the second image with the face of the " +
  "person in the first image, so it looks like the same person from the first " +
  "image naturally photographed in the scene. Keep everything else in the " +
  "second image exactly the same: pose, body, clothing, hair style, " +
  "background, lighting, colors, composition and image dimensions. " +
  "Output only the edited second image.";

export interface SwapResult {
  paths: string[];
  count: number;
  elapsedMs: number;
  cachedCount: number;
  soundPath: string | null;
  soundName: string | null;
  soundAuthor: string | null;
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Best-effort download of the post's sound. playUrl is a signed, expiring
 * TikTok CDN link, so this must run right after the scrape.
 */
async function downloadSound(
  item: TikTokItem,
  dir: Awaited<ReturnType<typeof runDir>>,
): Promise<string | null> {
  const playUrl = (item.musicMeta as { playUrl?: string } | undefined)?.playUrl;
  if (!playUrl) {
    return null;
  }
  const outName = "sound.mp3";
  if (await dir.exists(outName)) {
    return dir.file(outName);
  }
  try {
    const response = await fetch(playUrl, {
      headers: { "user-agent": BROWSER_UA },
    });
    if (!response.ok) {
      info(`sound download skipped — HTTP ${response.status}`);
      return null;
    }
    await dir.writeBytes(outName, new Uint8Array(await response.arrayBuffer()));
    ok(`sound.mp3 (${(item.musicMeta?.musicName as string) ?? "unknown"})`);
    return dir.file(outName);
  } catch (error) {
    info(`sound download skipped — ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Downloads each carousel image and face-swaps it with Nano Banana, using the
 * character photo as the identity reference. Outputs land in
 * out/<postId>/swapped-<n>.png and are reused on re-runs.
 */
export async function swapPhotos(
  postId: string,
  options: { imagePath: string; force?: boolean },
): Promise<SwapResult> {
  step("Face-swapping carousel images (Nano Banana)");
  const elapsed = timer();
  const dir = await runDir(postId);

  if (!(await dir.exists(FILES.item))) {
    throw new Error(`No ${dir.display(FILES.item)} — run step 01 for this post first.`);
  }
  const item = await dir.readJson<TikTokItem>(FILES.item);
  const urls = carouselImageUrls(item);
  if (urls.length === 0) {
    throw new Error("No carousel image links in the dataset item.");
  }

  const facePath = resolve(options.imagePath);
  const face = {
    bytes: await readFile(facePath),
    mimeType: imageMimeType(facePath),
  };
  info(`face: ${basename(facePath)} · ${urls.length} carousel image(s)`);

  let cachedCount = 0;

  const swapOne = async (index: number): Promise<string> => {
    const outName = `swapped-${index + 1}.png`;
    if (!options.force && (await dir.exists(outName))) {
      ok(`${outName} cached — pass --force to redo`);
      cachedCount += 1;
      return dir.file(outName);
    }

    const srcName = `carousel-${index + 1}.jpg`;
    if (options.force || !(await dir.exists(srcName))) {
      const response = await fetch(urls[index]!);
      if (!response.ok) {
        throw new Error(
          `Could not download carousel image ${index + 1}: HTTP ${response.status}`,
        );
      }
      await dir.writeBytes(srcName, new Uint8Array(await response.arrayBuffer()));
    }

    const target = {
      bytes: await dir.readBytes(srcName),
      mimeType: "image/jpeg",
    };
    const swapTimer = timer();
    const edited = await editImage(face, target, SWAP_PROMPT);
    await dir.writeBytes(outName, edited);
    ok(`${outName} (${formatMs(swapTimer())})`);
    return dir.file(outName);
  };

  // Swap in parallel, capped so Gemini rate limits don't bite.
  const CONCURRENCY = 4;
  const paths = new Array<string>(urls.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
      while (next < urls.length) {
        const index = next;
        next += 1;
        paths[index] = await swapOne(index);
      }
    }),
  );

  const soundPath = await downloadSound(item, dir);

  detail(`swapped images in ${dir.display("")}`);
  return {
    paths,
    count: paths.length,
    elapsedMs: elapsed(),
    cachedCount,
    soundPath,
    soundName: item.musicMeta?.musicName ?? null,
    soundAuthor: item.musicMeta?.musicAuthor ?? null,
  };
}
