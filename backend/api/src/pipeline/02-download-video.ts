import type { TikTokItem } from "./lib/apify";
import { env } from "./lib/env";
import { detail, formatBytes, formatMs, info, ok, step, timer, warn } from "./lib/log";
import { hasAudioTrack } from "./lib/media";
import { FILES, runDir, type RunDir } from "./lib/run-store";

export interface DownloadResult {
  path: string;
  bytes: number;
  authRequired: boolean;
  contentType: string | null;
  hasAudio: boolean;
  sourceUrl: string;
  elapsedMs: number;
  cached: boolean;
}

/**
 * Pulls the MP4 the actor stored for us. Answers: is the Apify key-value-store URL
 * publicly fetchable, or does it need the API token?
 */
export async function downloadVideo(
  postId: string,
  options: { force?: boolean } = {},
): Promise<DownloadResult> {
  step("Downloading source video");
  const dir = await runDir(postId);

  if (!(await dir.exists(FILES.item))) {
    throw new Error(`No ${dir.display(FILES.item)} — run step 01 for this post first.`);
  }

  const item = await dir.readJson<TikTokItem>(FILES.item);
  const sourceUrl = item.videoMeta?.downloadAddr;
  if (!sourceUrl) {
    throw new Error("No videoMeta.downloadAddr in the dataset item.");
  }

  if (!options.force && (await dir.exists(FILES.sourceVideo))) {
    const previous = await dir.readJson<DownloadResult>(FILES.download).catch(() => null);
    const bytes = await dir.size(FILES.sourceVideo);
    ok(`Reusing ${dir.display(FILES.sourceVideo)} (${formatBytes(bytes)}) — pass --force to re-download`);
    return {
      path: dir.file(FILES.sourceVideo),
      bytes,
      authRequired: previous?.authRequired ?? false,
      contentType: previous?.contentType ?? null,
      hasAudio: previous?.hasAudio ?? hasAudioTrack(await dir.readBytes(FILES.sourceVideo)),
      sourceUrl,
      elapsedMs: 0,
      cached: true,
    };
  }

  info(sourceUrl);
  const elapsed = timer();
  const { response, authRequired } = await fetchVideo(sourceUrl);
  const bytes = Buffer.from(await response.arrayBuffer());
  const elapsedMs = elapsed();

  if (bytes.length === 0) {
    throw new Error("Downloaded 0 bytes — the stored record is empty or already expired.");
  }

  const contentType = response.headers.get("content-type");
  if (contentType && !contentType.startsWith("video/")) {
    warn(`Unexpected content-type ${contentType} — expected video/*`);
  }

  await dir.writeBytes(FILES.sourceVideo, bytes);
  const hasAudio = hasAudioTrack(bytes);

  const result: DownloadResult = {
    path: dir.file(FILES.sourceVideo),
    bytes: bytes.length,
    authRequired,
    contentType,
    hasAudio,
    sourceUrl,
    elapsedMs,
    cached: false,
  };
  await dir.writeJson(FILES.download, result);

  ok(`Saved ${dir.display(FILES.sourceVideo)} — ${formatBytes(bytes.length)} in ${formatMs(elapsedMs)}`);
  info(`auth needed: ${authRequired ? "yes (Bearer token)" : "no (public URL)"}`);
  info(`audio track: ${hasAudio ? "yes" : "no"}`);
  noteRetention(sourceUrl, dir);

  return result;
}

/** Try the URL bare first; only fall back to the token so we learn which is required. */
async function fetchVideo(url: string): Promise<{ response: Response; authRequired: boolean }> {
  const anonymous = await fetch(url, { redirect: "follow" });
  if (anonymous.ok) return { response: anonymous, authRequired: false };

  if (anonymous.status !== 401 && anonymous.status !== 403) {
    throw new Error(`HTTP ${anonymous.status} ${anonymous.statusText} fetching the video.`);
  }

  await anonymous.body?.cancel();
  detail(`HTTP ${anonymous.status} without auth — retrying with the Apify token`);

  const authenticated = await fetch(url, {
    redirect: "follow",
    headers: { authorization: `Bearer ${env.apifyToken}` },
  });
  if (!authenticated.ok) {
    throw new Error(
      `HTTP ${authenticated.status} ${authenticated.statusText} fetching the video even with a token — ` +
        "the key-value-store record has most likely expired (unnamed stores are kept ~7 days). " +
        "Re-run step 01 with --force.",
    );
  }
  return { response: authenticated, authRequired: true };
}

function noteRetention(sourceUrl: string, dir: RunDir): void {
  if (new URL(sourceUrl).hostname !== "api.apify.com") return;
  detail(
    "Apify keeps unnamed key-value stores ~7 days. In production pass " +
      "`videoKvStoreIdOrName` to use a named store (kept indefinitely) or copy the file to our " +
      `own storage right away — which is what ${dir.display(FILES.sourceVideo)} is doing here.`,
  );
}
