import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { findFacePhoto } from "../03-create-character";
import { detail, formatBytes, formatMs, info, ok, step, timer, warn } from "../lib/log";
import { hasAudioTrack, imageMimeType } from "../lib/media";
import { FILES, renderV2Json, renderV2Video, runDir, type RunDir } from "../lib/run-store";
import { hasFfmpeg, probe, trim } from "./lib/ffmpeg";
import {
  CREDIT_USD,
  estimateCredits,
  fetchBytes,
  isSeedanceModel,
  MODELS,
  organizationInfo,
  pollTask,
  runway,
  uploadEphemeral,
  type RenderModel,
} from "./lib/runway";

const RENDER_TIMEOUT_MS = 20 * 60_000;

/**
 * Seedance and Gemini re-render the clip, so the prompt has to say that only the
 * performer changes. act_two takes no prompt at all — the character image is the
 * whole instruction.
 */
const DEFAULT_PROMPT =
  "The person shown in the reference image performs this scene. " +
  "Keep the same choreography, body motion, camera movement, framing, pacing and background as the input video. " +
  "Photorealistic, natural lighting, consistent identity across every frame.";

export interface RunwayRenderOptions {
  model?: RenderModel;
  imagePath?: string;
  promptText?: string;
  ratio?: string;
  duration?: number;
  audio?: boolean;
  /** act_two only: apply body movement, not just facial expression. */
  bodyControl?: boolean;
  force?: boolean;
}

export interface RunwayRenderResult {
  taskId: string;
  model: RenderModel;
  provider: string;
  path: string;
  bytes: number;
  hasAudio: boolean;
  sourceHasAudio: boolean;
  sourceDurationS: number | null;
  duration: number;
  ratio: string | null;
  promptText: string | null;
  imagePath: string;
  imageSha256: string;
  trimmed: boolean;
  creditsBefore: number | null;
  creditsAfter: number | null;
  creditsSpent: number | null;
  estimatedCredits: number;
  elapsedMs: number;
  outputUrl: string | null;
  cached: boolean;
}

/**
 * v2 of the render step, across every Runway model that takes a video in:
 * - `seedance2*` / `gemini_omni_flash` → /v1/video_to_video, re-generating the
 *   clip from a prompt plus the face as an image reference.
 * - `aleph2` → the same endpoint, but the face can only be pinned as a keyframe.
 * - `act_two` → /v1/character_performance, animating the face photo with the
 *   TikTok as a driving performance (v1's Viggle shape, different background).
 */
export async function renderWithRunway(
  postId: string,
  options: RunwayRenderOptions = {},
): Promise<RunwayRenderResult> {
  const dir = await runDir(postId);

  if (!(await dir.exists(FILES.sourceVideo))) {
    throw new Error(`No ${dir.display(FILES.sourceVideo)} — run step 02 for this post first.`);
  }

  const model = options.model ?? "gemini_omni_flash";
  const spec = MODELS[model];
  const videoFile = renderV2Video(model);
  const jsonFile = renderV2Json(model);

  const imagePath = options.imagePath ? resolve(options.imagePath) : await findFacePhoto();
  const imageBytes = await readFile(imagePath);
  const imageSha256 = createHash("sha256").update(imageBytes).digest("hex");
  const promptText = spec.face === "character" ? null : (options.promptText ?? DEFAULT_PROMPT);

  const measured = await probe(dir.file(FILES.sourceVideo));
  const sourceDurationS = measured?.durationS ?? null;
  const duration = pickDuration(model, options.duration, sourceDurationS);
  const ratio =
    spec.ratios === null
      ? null
      : (options.ratio ?? pickRatio(spec.ratios, measured?.width ?? null, measured?.height ?? null));

  if (!options.force && (await dir.exists(videoFile))) {
    const previous = await dir.readJson<RunwayRenderResult>(jsonFile).catch(() => null);
    const sameInputs =
      previous?.imageSha256 === imageSha256 &&
      previous.promptText === promptText &&
      previous.duration === duration &&
      previous.ratio === ratio;
    if (sameInputs) {
      step(`Rendering with Runway · ${model} (cached)`);
      ok(`Reusing ${dir.display(videoFile)} — pass --force to render again`);
      return { ...previous, cached: true };
    }
    warn(`${dir.display(videoFile)} was rendered with different inputs — overwriting it.`);
  }

  step(`Rendering with Runway · ${model}`);

  const { path: motionPath, trimmed } = await prepareMotion(dir, model, sourceDurationS, duration);
  const motionBytes = await readFile(motionPath);
  const sourceHasAudio = hasAudioTrack(motionBytes);

  const estimatedCredits = estimateCredits(model, duration);
  const creditsBefore = await readBalance();

  info(`model:    ${model} (${spec.provider}, face as ${spec.face})`);
  info(`face:     ${basename(imagePath)} (${imageSha256.slice(0, 12)})`);
  info(
    `motion:   ${dir.display(trimmed ? FILES.motionVideo : FILES.sourceVideo)} ` +
      `(${formatBytes(motionBytes.length)}${sourceDurationS ? `, ${sourceDurationS.toFixed(1)}s source` : ""})`,
  );
  info(`output:   ${duration}s${ratio ? ` @ ${ratio}` : " @ matched to input"}`);
  info(
    `credits:  ${creditsBefore ?? "?"} before · ~${estimatedCredits} expected ` +
      `(~$${(estimatedCredits * CREDIT_USD).toFixed(2)})`,
  );

  const elapsed = timer();

  const [motionUri, faceUri] = await Promise.all([
    uploadEphemeral({ bytes: motionBytes, filename: `${postId}.mp4`, contentType: "video/mp4" }),
    uploadEphemeral({
      bytes: imageBytes,
      filename: basename(imagePath),
      contentType: imageMimeType(imagePath),
    }),
  ]);
  detail("uploaded motion + face (runway:// URIs, valid 24h)");

  const created = await createTask(model, {
    motionUri,
    faceUri,
    promptText,
    ratio,
    duration,
    audio: options.audio ?? true,
    bodyControl: options.bodyControl ?? true,
  });
  detail(`created task ${created.id}`);

  const task = await pollTask(created.id, { label: model, timeoutMs: RENDER_TIMEOUT_MS });
  const elapsedMs = elapsed();
  ok(`Task ${task.id} succeeded in ${formatMs(elapsedMs)}`);

  const outputUrl = task.output[0];
  if (!outputUrl) throw new Error(`Task ${task.id} succeeded but returned no output URL.`);

  // Output URLs expire in 24–48h — grab the bytes before anything else.
  const bytes = await fetchBytes(outputUrl);
  await dir.writeBytes(videoFile, bytes);
  const outputHasAudio = hasAudioTrack(bytes);

  const creditsAfter = await readBalance();
  const creditsSpent =
    creditsBefore != null && creditsAfter != null ? creditsBefore - creditsAfter : null;

  const result: RunwayRenderResult = {
    taskId: task.id,
    model,
    provider: spec.provider,
    path: dir.file(videoFile),
    bytes: bytes.length,
    hasAudio: outputHasAudio,
    sourceHasAudio,
    sourceDurationS,
    duration,
    ratio,
    promptText,
    imagePath,
    imageSha256,
    trimmed,
    creditsBefore,
    creditsAfter,
    creditsSpent,
    estimatedCredits,
    elapsedMs,
    outputUrl,
    cached: false,
  };
  await dir.writeJson(jsonFile, result);

  ok(`Saved ${dir.display(videoFile)} — ${formatBytes(bytes.length)}`);
  info(
    `credits:  ${creditsAfter ?? "?"} after` +
      (creditsSpent != null
        ? ` (spent ${creditsSpent} — $${(creditsSpent * CREDIT_USD).toFixed(2)})`
        : ""),
  );
  info(`audio:    source ${sourceHasAudio ? "yes" : "no"} → render ${outputHasAudio ? "yes" : "no"}`);

  return result;
}

interface TaskInputs {
  motionUri: string;
  faceUri: string;
  promptText: string | null;
  ratio: string | null;
  duration: number;
  audio: boolean;
  bodyControl: boolean;
}

/** Each model wants the same three things under a different set of field names. */
async function createTask(model: RenderModel, inputs: TaskInputs): Promise<{ id: string }> {
  if (isSeedanceModel(model)) {
    return runway().videoToVideo.create({
      model,
      promptVideo: inputs.motionUri,
      references: [{ uri: inputs.faceUri }],
      promptText: inputs.promptText!,
      ratio: inputs.ratio as never,
      duration: inputs.duration,
      audio: inputs.audio,
    });
  }

  if (model === "gemini_omni_flash") {
    return runway().videoToVideo.create({
      model,
      videoUri: inputs.motionUri,
      promptText: inputs.promptText!,
      references: [{ uri: inputs.faceUri }],
    });
  }

  if (model === "aleph2") {
    // Aleph keyframes are full-frame targets ("make the video look like this
    // here"), not identity references, so pinning a portrait at t=0 makes the
    // clip morph into that portrait. Kept for completeness; see MODELS.aleph2.
    return runway().videoToVideo.create({
      model,
      videoUri: inputs.motionUri,
      promptText: inputs.promptText!,
      keyframes: [{ seconds: 0, uri: inputs.faceUri }],
    });
  }

  return runway().characterPerformance.create({
    model: "act_two",
    character: { type: "image", uri: inputs.faceUri },
    reference: { type: "video", uri: inputs.motionUri },
    bodyControl: inputs.bodyControl,
    ratio: inputs.ratio as never,
  });
}

/**
 * Output length. Seedance takes it as an explicit parameter; the others simply
 * follow the input, so this is the length we feed them.
 */
function pickDuration(
  model: RenderModel,
  requested: number | undefined,
  sourceDurationS: number | null,
): number {
  const spec = MODELS[model];
  const source = sourceDurationS != null ? Math.round(sourceDurationS) : 10;
  const wanted = requested ?? source;
  if (wanted < spec.minInputS && requested == null) {
    throw new Error(
      `Source is ${sourceDurationS?.toFixed(1) ?? "?"}s but ${model} needs ${spec.minInputS}–${spec.maxInputS}s.`,
    );
  }
  return Math.min(spec.maxInputS, Math.max(spec.minInputS, wanted));
}

/** Nearest ratio the model supports to the source's aspect; vertical when unknown. */
function pickRatio(allowed: readonly string[], width: number | null, height: number | null): string {
  const fallback = "720:1280";
  if (!width || !height) return fallback;
  const target = width / height;
  return allowed.reduce((best, candidate) => {
    const [w, h] = candidate.split(":").map(Number) as [number, number];
    const [bw, bh] = best.split(":").map(Number) as [number, number];
    return Math.abs(w / h - target) < Math.abs(bw / bh - target) ? candidate : best;
  }, fallback);
}

/**
 * Returns the file to send as the driving video, cutting it down when the TikTok
 * runs past the model's ceiling. Trimmed output is shared across models, so the
 * name carries the length it was cut to.
 */
async function prepareMotion(
  dir: RunDir,
  model: RenderModel,
  sourceDurationS: number | null,
  duration: number,
): Promise<{ path: string; trimmed: boolean }> {
  const sourcePath = dir.file(FILES.sourceVideo);
  if (sourceDurationS == null || sourceDurationS <= duration + 0.25) {
    return { path: sourcePath, trimmed: false };
  }

  if (!(await hasFfmpeg())) {
    warn(
      `Source is ${sourceDurationS.toFixed(1)}s but ${model} caps at ${duration}s, and ffmpeg is ` +
        "not installed — sending the full clip and letting Runway handle the timing.",
    );
    return { path: sourcePath, trimmed: false };
  }

  const motionPath = dir.file(FILES.motionVideo);
  await trim(sourcePath, motionPath, duration);
  detail(
    `trimmed ${sourceDurationS.toFixed(1)}s → ${duration}s into ${dir.display(FILES.motionVideo)}`,
  );
  return { path: motionPath, trimmed: true };
}

/** A failed balance read must not sink an otherwise good render. */
async function readBalance(): Promise<number | null> {
  try {
    return (await organizationInfo()).balance;
  } catch {
    return null;
  }
}
