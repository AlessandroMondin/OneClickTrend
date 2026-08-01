import { readFileSync } from "node:fs";
import { flagValue, hasFlag, parseArgs, runCli } from "./lib/cli";
import { fail, ok, step } from "./lib/log";
import { hasAudioTrack, imageMimeType } from "./lib/media";
import { resolveTikTokUrl } from "./lib/tiktok-url";

/**
 * Checks the pure helpers without touching either API, so the parsing and
 * detection logic can be verified with no keys and no credits.
 *
 * Pass two fixtures to also exercise the audio probe:
 *   pnpm smoke --with-audio a.mp4 --without-audio b.mp4
 */

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const got = JSON.stringify(actual);
  const want = JSON.stringify(expected);
  if (got === want) ok(`${label} → ${got}`);
  else {
    failures += 1;
    fail(`${label}: expected ${want}, got ${got}`);
  }
}

async function throws(label: string, body: () => Promise<unknown>): Promise<void> {
  try {
    await body();
    check(label, "no error", "an error");
  } catch {
    ok(label);
  }
}

export async function smokeTest(fixtures: { withAudio?: string; withoutAudio?: string } = {}): Promise<void> {
  step("parseArgs");
  const args = parseArgs(["https://x/y", "--force", "--image", "/tmp/a.png", "--background=solid"]);
  check("positional", args.positional, ["https://x/y"]);
  check("bare flag", hasFlag(args, "force"), true);
  check("--key value", flagValue(args, "image"), "/tmp/a.png");
  check("--key=value", flagValue(args, "background"), "solid");
  check("absent flag", hasFlag(args, "nope"), false);

  step("imageMimeType");
  check("uppercase .JPG", imageMimeType("/a/face.JPG"), "image/jpeg");
  check(".png", imageMimeType("face.png"), "image/png");
  check(".webp", imageMimeType("face.webp"), "image/webp");
  await throws("rejects .gif (Viggle takes PNG/JPEG/WebP only)", async () => imageMimeType("face.gif"));

  step("resolveTikTokUrl — canonical input needs no network");
  const video = await resolveTikTokUrl(
    "https://www.tiktok.com/@maxjenning/video/7667605072645295390?is_from_webapp=1",
  );
  check("postId", video.postId, "7667605072645295390");
  check("handle", video.handle, "maxjenning");
  check("kind", video.kind, "video");
  check("tracking params stripped", video.canonicalUrl, "https://www.tiktok.com/@maxjenning/video/7667605072645295390");
  check("wasShortLink", video.wasShortLink, false);

  const photo = await resolveTikTokUrl("https://www.tiktok.com/@someone/photo/7123456789012345678");
  check("photo carousel detected", photo.kind, "photo");

  await throws("rejects a non-TikTok host", () => resolveTikTokUrl("https://example.com/video/1"));
  await throws("rejects a non-URL", () => resolveTikTokUrl("not a url"));

  step("hasAudioTrack");
  if (fixtures.withAudio && fixtures.withoutAudio) {
    check("mp4 with an audio track", hasAudioTrack(readFileSync(fixtures.withAudio)), true);
    check("mp4 without one", hasAudioTrack(readFileSync(fixtures.withoutAudio)), false);
  } else {
    ok("skipped fixture comparison — pass --with-audio and --without-audio to run it");
  }
  check("empty buffer", hasAudioTrack(Buffer.alloc(64)), false);

  step(failures === 0 ? "All checks passed" : `${failures} check(s) FAILED`);
  if (failures > 0) throw new Error(`${failures} smoke check(s) failed`);
}

await runCli(import.meta.url, async () => {
  const args = parseArgs();
  await smokeTest({
    withAudio: flagValue(args, "with-audio"),
    withoutAudio: flagValue(args, "without-audio"),
  });
});
