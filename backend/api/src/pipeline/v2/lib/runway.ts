import { File } from "node:buffer";
import RunwayML, { TaskFailedError } from "@runwayml/sdk";
import type { TaskRetrieveResponse } from "@runwayml/sdk/resources/tasks";
import { env } from "../../lib/env";
import { detail, formatMs } from "../../lib/log";

/** Runway bills in credits; the dev portal sells them at $0.01 each. */
export const CREDIT_USD = 0.01;

export type SeedanceModel = "seedance2" | "seedance2_fast" | "seedance2_mini";

/**
 * Every Runway model that can take a video in and give a video out, which is
 * what "put this face into this trend" needs. They differ in three ways that
 * matter: who actually runs the model (and therefore whose content moderation
 * screens the input), how the face photo reaches it, and how long an input they
 * accept.
 */
export type RenderModel = SeedanceModel | "act_two" | "aleph2" | "gemini_omni_flash";

/** How the face photo is handed to a model. */
export type FaceInput =
  /** A persistent image reference the model keeps in mind for every frame. */
  | "reference"
  /** A guidance image pinned to one timestamp of the input video. */
  | "keyframe"
  /** The subject itself: the model animates this image. */
  | "character";

export interface ModelSpec {
  endpoint: string;
  /** Whose moderation screens the input — the source of SAFETY.THIRD_PARTY. */
  provider: "bytedance" | "google" | "runway";
  creditsPerSecond: number;
  /** Charged even if the clip is shorter than this many credits' worth. */
  minCredits: number;
  minInputS: number;
  maxInputS: number;
  face: FaceInput;
  /** Models that infer the output size from the input take no ratio. */
  ratios: readonly string[] | null;
  notes: string;
}

const SEEDANCE_RATIOS = [
  "1470:630",
  "1280:720",
  "1112:834",
  "960:960",
  "834:1112",
  "720:1280",
] as const;

const SEEDANCE_SPEC = {
  endpoint: "/v1/video_to_video",
  provider: "bytedance",
  minCredits: 0,
  minInputS: 4,
  maxInputS: 15,
  face: "reference",
  ratios: SEEDANCE_RATIOS,
} as const;

export const MODELS: Record<RenderModel, ModelSpec> = {
  seedance2: {
    ...SEEDANCE_SPEC,
    creditsPerSecond: 36,
    notes: "Re-generates the clip from the prompt + face reference. Best fidelity, priciest.",
  },
  seedance2_fast: {
    ...SEEDANCE_SPEC,
    creditsPerSecond: 29,
    notes: "Same as seedance2, 480p/720p only.",
  },
  seedance2_mini: {
    ...SEEDANCE_SPEC,
    creditsPerSecond: 16,
    minCredits: 64,
    notes: "Cheapest Seedance tier; 64-credit floor per generation.",
  },
  gemini_omni_flash: {
    endpoint: "/v1/video_to_video",
    provider: "google",
    creditsPerSecond: 11,
    minCredits: 0,
    minInputS: 1,
    maxInputS: 10,
    face: "reference",
    ratios: null,
    notes: "Edits the input video from an instruction. Output is 720p matching the input orientation.",
  },
  aleph2: {
    endpoint: "/v1/video_to_video",
    provider: "runway",
    creditsPerSecond: 28,
    minCredits: 56,
    minInputS: 1,
    maxInputS: 30,
    face: "keyframe",
    ratios: null,
    notes:
      "Runway-native video editing. Keyframes are full-frame targets rather than identity references, " +
      "so it is a poor fit for face transfer — kept for prompt-only edits.",
  },
  act_two: {
    endpoint: "/v1/character_performance",
    provider: "runway",
    creditsPerSecond: 5,
    minCredits: 0,
    minInputS: 3,
    maxInputS: 30,
    face: "character",
    ratios: ["1584:672", "1280:720", "1104:832", "960:960", "832:1104", "720:1280"],
    notes: "Animates the face photo with the video as a driving performance — keeps the PHOTO's background, not the trend's.",
  },
};

export const RENDER_MODELS = Object.keys(MODELS) as RenderModel[];

/** Credits per second of output, from https://docs.dev.runwayml.com/guides/pricing. */
export const CREDITS_PER_SECOND: Record<RenderModel, number> = Object.fromEntries(
  RENDER_MODELS.map((model) => [model, MODELS[model].creditsPerSecond]),
) as Record<RenderModel, number>;

export function estimateCredits(model: RenderModel, seconds: number): number {
  const spec = MODELS[model];
  return Math.max(spec.minCredits, spec.creditsPerSecond * seconds);
}

export function isRenderModel(value: string): value is RenderModel {
  return (RENDER_MODELS as string[]).includes(value);
}

export function isSeedanceModel(value: RenderModel): value is SeedanceModel {
  return value.startsWith("seedance");
}

let cached: RunwayML | null = null;

/**
 * Built lazily so a step that never talks to Runway does not fail on a missing
 * key — same contract as the Viggle/Apify clients in v1.
 */
export function runway(): RunwayML {
  if (!cached) {
    cached = new RunwayML({ apiKey: env.runwayApiKey, baseURL: env.runwayBaseUrl });
  }
  return cached;
}

export interface UploadFile {
  bytes: Buffer;
  filename: string;
  contentType: string;
}

/**
 * Pushes a local file to Runway's object storage and returns a `runway://` URI.
 * Beats data URIs: those cap at 5MB for images and 16MB for video, while an
 * ephemeral upload takes 200MB. The URI is valid for 24 hours.
 */
export async function uploadEphemeral(file: UploadFile): Promise<string> {
  const { uri } = await runway().uploads.createEphemeral({
    file: new File([file.bytes], file.filename, { type: file.contentType }),
  });
  return uri;
}

export interface CreditInfo {
  balance: number;
  maxConcurrent: number | null;
  maxDaily: number | null;
  usedToday: number | null;
}

export async function organizationInfo(model?: RenderModel): Promise<CreditInfo> {
  const org = await runway().organization.retrieve();
  const limits = model ? org.tier.models[model] : undefined;
  return {
    balance: org.creditBalance,
    maxConcurrent: limits?.maxConcurrentGenerations ?? null,
    maxDaily: limits?.maxDailyGenerations ?? null,
    usedToday: model ? (org.usage.models[model]?.dailyGenerations ?? 0) : null,
  };
}

export interface PollOptions {
  label: string;
  timeoutMs: number;
  intervalMs?: number;
}

/**
 * Polls a task by hand rather than using the SDK's `waitForTaskOutput()` so the
 * run prints the same live progress lines as the v1 Viggle steps. Runway asks
 * for no more than one poll every five seconds per task.
 */
export async function pollTask(
  taskId: string,
  options: PollOptions,
): Promise<TaskRetrieveResponse.Succeeded> {
  const { label, timeoutMs, intervalMs = 5000 } = options;
  const deadline = Date.now() + timeoutMs;
  let lastLine = "";

  for (;;) {
    const task = await runway().tasks.retrieve(taskId);
    const line = [task.status, "progress" in task ? `${Math.round(task.progress * 100)}%` : null]
      .filter(Boolean)
      .join(" · ");
    if (line !== lastLine) {
      detail(`${label}: ${line}`);
      lastLine = line;
    }

    if (task.status === "SUCCEEDED") return task;
    if (task.status === "FAILED") {
      // The bare message ("blocked by content moderation") is not actionable;
      // the code says which input was rejected and whether a retry is pointless.
      throw new Error(
        `${task.failure}${task.failureCode ? ` [${task.failureCode}]` : ""} — task ${task.id}`,
      );
    }
    if (task.status === "CANCELLED") {
      throw new TaskFailedError(task);
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `${label} still ${task.status} after ${formatMs(timeoutMs)} — task ${taskId}. ` +
          "It may still finish; re-run this step to keep polling.",
      );
    }
    await sleep(intervalMs);
  }
}

/** Output URLs expire in 24–48h, so every run downloads its own copy. */
export async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { TaskFailedError };
