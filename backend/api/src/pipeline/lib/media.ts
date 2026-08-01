import { extname } from "node:path";

const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export const IMAGE_EXTENSIONS = Object.keys(IMAGE_TYPES);

/** Both Viggle (Character image) and Runway (image reference) take PNG, JPEG and WebP only. */
export function imageMimeType(path: string): string {
  const type = IMAGE_TYPES[extname(path).toLowerCase()];
  if (!type) {
    throw new Error(
      `Unsupported image type: ${path}. Only ${IMAGE_EXTENSIONS.join(", ")} are accepted.`,
    );
  }
  return type;
}

/**
 * Heuristic audio-track check that avoids an ffprobe dependency: an MP4 `hdlr`
 * box stores its 4-byte handler type 12 bytes after the box name, and `soun`
 * marks an audio track. Good enough to answer "did Viggle keep the sound?".
 */
export function hasAudioTrack(bytes: Buffer): boolean {
  let index = bytes.indexOf("hdlr", 0, "latin1");
  while (index !== -1) {
    if (bytes.toString("latin1", index + 12, index + 16) === "soun") return true;
    index = bytes.indexOf("hdlr", index + 1, "latin1");
  }
  return false;
}
