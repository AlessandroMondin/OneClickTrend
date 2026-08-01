import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface VideoProbe {
  durationS: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
}

/**
 * ffprobe is optional: without it the pipeline falls back to the duration Apify
 * reports in item.json. Everything else degrades to "unknown" and Runway gets
 * the untrimmed file.
 */
export async function probe(path: string): Promise<VideoProbe | null> {
  try {
    const { stdout } = await run("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      path,
    ]);
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    };
    const video = parsed.streams?.find((stream) => stream.codec_type === "video");
    const duration = Number(parsed.format?.duration);

    return {
      durationS: Number.isFinite(duration) ? duration : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      hasAudio: parsed.streams?.some((stream) => stream.codec_type === "audio") ?? false,
    };
  } catch {
    return null;
  }
}

/**
 * Cuts the first `seconds` of a video, re-encoding so the cut lands exactly
 * where asked instead of on the previous keyframe (stream-copy would drift by
 * up to a couple of seconds, which matters a lot inside a 15s budget).
 */
export async function trim(input: string, output: string, seconds: number): Promise<void> {
  await run("ffmpeg", [
    "-y",
    "-i",
    input,
    "-t",
    String(seconds),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    output,
  ]);
}

export async function hasFfmpeg(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}
