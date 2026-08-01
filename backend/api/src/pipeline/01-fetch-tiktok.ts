import { scrapePost, type RunSummary, type TikTokItem } from "./lib/apify";
import { detail, formatMs, info, ok, step, warn } from "./lib/log";
import { FILES, runDir, type RunDir } from "./lib/run-store";
import { resolveTikTokUrl, type ResolvedPost } from "./lib/tiktok-url";

export interface FetchResult {
  post: ResolvedPost;
  item: TikTokItem;
  run: RunSummary | null;
  dir: RunDir;
  cached: boolean;
}

/**
 * Resolves a share URL and runs the Apify actor for that single post.
 * Answers: does the actor take a short link, what does one run cost, and does
 * `shouldDownloadVideos` really give us an Apify-hosted MP4?
 */
export async function fetchTikTok(
  input: string,
  options: { force?: boolean } = {},
): Promise<FetchResult> {
  step("Resolving TikTok URL");
  const post = await resolveTikTokUrl(input);

  info(`input:     ${post.input}`);
  info(`canonical: ${post.canonicalUrl}`);
  if (post.wasShortLink) {
    ok(`Share link resolved to post ${post.postId}${post.handle ? ` by @${post.handle}` : ""}`);
  } else {
    ok(`Post ${post.postId}${post.handle ? ` by @${post.handle}` : ""}`);
  }

  if (post.kind === "photo") {
    throw new Error(
      `This is a photo carousel, not a video (${post.canonicalUrl}). ` +
        "Viggle transfers motion from a driving video, so a slideshow has nothing to animate. " +
        "Try a video post instead.",
    );
  }

  const dir = await runDir(post.postId);
  await dir.writeJson(FILES.resolvedUrl, post);

  if (!options.force && (await dir.exists(FILES.item))) {
    const item = await dir.readJson<TikTokItem>(FILES.item);
    step("Scraping post (cached)");
    ok(`Reusing ${dir.display(FILES.item)} — pass --force to re-run the actor`);
    describeItem(item);
    return { post, item, run: null, dir, cached: true };
  }

  step("Scraping post via Apify");
  info(`actor input: postURLs=[${post.canonicalUrl}], shouldDownloadVideos=true`);
  const { item, run } = await scrapePost(post.canonicalUrl);

  await dir.writeJson(FILES.item, item);
  await dir.writeJson(FILES.run, run);

  ok(`Run ${run.runId} ${run.status} in ${formatMs(run.elapsedMs)}`);
  info(`cost: ${run.usageTotalUsd != null ? `$${run.usageTotalUsd.toFixed(4)}` : "not reported"}`);
  detail(`saved ${dir.display(FILES.item)} and ${dir.display(FILES.run)}`);

  assertVideoPost(item);
  describeItem(item);

  return { post, item, run, dir, cached: false };
}

function assertVideoPost(item: TikTokItem): void {
  if (item.isSlideshow) {
    throw new Error(
      "The actor reports this post is a slideshow — no driving video to send to Viggle.",
    );
  }

  const downloadAddr = item.videoMeta?.downloadAddr;
  if (!downloadAddr) {
    throw new Error(
      "No videoMeta.downloadAddr in the dataset item — the actor did not return a video URL.",
    );
  }

  // The whole point of shouldDownloadVideos: an Apify-hosted copy instead of a
  // signed TikTok CDN link that expires and demands browser headers.
  const host = new URL(downloadAddr).hostname;
  if (host === "api.apify.com") {
    ok("Video is hosted by Apify (stable URL, no TikTok headers needed)");
  } else {
    warn(
      `downloadAddr points at ${host}, not api.apify.com — the actor fell back to the ` +
        "TikTok CDN, so the URL is signed, short-lived and may need browser headers.",
    );
  }
}

function describeItem(item: TikTokItem): void {
  const duration = item.videoMeta?.duration;
  const meta = item.videoMeta;
  info(`author:   @${item.authorMeta?.name ?? "?"}`);
  info(`caption:  ${(item.text ?? "").slice(0, 80) || "(none)"}`);
  info(
    `video:    ${duration ?? "?"}s · ${meta?.width ?? "?"}x${meta?.height ?? "?"} · ` +
      `${meta?.definition ?? "?"} · ${meta?.format ?? "?"}`,
  );
  info(`music:    ${item.musicMeta?.musicName ?? "?"} — ${item.musicMeta?.musicAuthor ?? "?"}`);

  if (typeof duration === "number") {
    // Viggle bills 1 credit per second of output video.
    info(`estimated Viggle cost: ~${Math.ceil(duration)} credits for a full-length render`);
  } else {
    warn("No duration in videoMeta — cannot estimate the render cost up front.");
  }
}
