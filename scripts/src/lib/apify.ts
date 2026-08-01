import { ApifyClient } from "apify-client";
import { env } from "./env";

export interface TikTokItem {
  id?: string;
  text?: string;
  webVideoUrl?: string;
  isSlideshow?: boolean;
  slideshowImageLinks?: unknown[];
  mediaUrls?: string[];
  videoMeta?: {
    duration?: number;
    downloadAddr?: string;
    coverUrl?: string;
    format?: string;
    definition?: string;
    width?: number;
    height?: number;
  };
  authorMeta?: { name?: string; nickName?: string };
  musicMeta?: { musicName?: string; musicAuthor?: string; musicOriginal?: boolean };
  diggCount?: number;
  playCount?: number;
  createTimeISO?: string;
  [key: string]: unknown;
}

export interface RunSummary {
  runId: string;
  datasetId: string;
  status: string;
  usageTotalUsd: number | null;
  itemCount: number;
  elapsedMs: number;
}

export interface ScrapeResult {
  item: TikTokItem;
  run: RunSummary;
}

let cached: ApifyClient | undefined;

export function apify(): ApifyClient {
  cached ??= new ApifyClient({ token: env.apifyToken });
  return cached;
}

export async function whoAmI(): Promise<{ username?: string; plan?: unknown }> {
  const user = await apify().user("me").get();
  if (!user) throw new Error("Apify returned no user for this token.");
  return user;
}

/**
 * Single-post input. `shouldDownloadVideos` is the flag that matters: with it on,
 * the actor rewrites `videoMeta.downloadAddr` to an api.apify.com key-value-store
 * URL instead of an expiring, header-gated TikTok CDN link.
 */
export function buildActorInput(postUrl: string): Record<string, unknown> {
  return {
    postURLs: [postUrl],
    resultsPerPage: 1,
    shouldDownloadVideos: true,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadAvatars: false,
    shouldDownloadMusicCovers: false,
    downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    commentsPerPost: 0,
    topLevelCommentsPerPost: 0,
    maxRepliesPerComment: 0,
    scrapeRelatedVideos: false,
    scrapeRelatedSearchWords: false,
    scrapeAdditionalAuthorMeta: false,
    proxyCountryCode: "None",
  };
}

export async function scrapePost(postUrl: string, waitSecs = 300): Promise<ScrapeResult> {
  const startedAt = Date.now();
  const run = await apify().actor(env.actorId).call(buildActorInput(postUrl), { waitSecs });
  const elapsedMs = Date.now() - startedAt;

  if (run.status !== "SUCCEEDED") {
    throw new Error(
      `Actor run ${run.id} finished with status ${run.status}. ` +
        `See https://console.apify.com/actors/runs/${run.id}`,
    );
  }

  const { items } = await apify().dataset(run.defaultDatasetId).listItems();
  const item = items[0] as TikTokItem | undefined;
  if (!item) {
    throw new Error(
      `Actor run ${run.id} succeeded but returned no items — the post may be private, ` +
        "region-locked or deleted.",
    );
  }
  if (typeof item.error === "string") {
    throw new Error(`Actor reported an error for this post: ${item.error}`);
  }

  return {
    item,
    run: {
      runId: run.id,
      datasetId: run.defaultDatasetId,
      status: run.status,
      usageTotalUsd: run.usageTotalUsd ?? null,
      itemCount: items.length,
      elapsedMs,
    },
  };
}
