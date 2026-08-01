import { ensureCharacter } from "./03-create-character";
import { detail, formatBytes, formatMs, info, ok, step, timer, warn } from "./lib/log";
import { hasAudioTrack } from "./lib/media";
import { FILES, runDir } from "./lib/run-store";
import {
  assertReady,
  createRender,
  downloadRender,
  getCredits,
  getRender,
  pollUntilTerminal,
} from "./lib/viggle";

const RENDER_TIMEOUT_MS = 15 * 60_000;

export interface RenderResult {
  renderId: string;
  characterId: string;
  path: string;
  bytes: number;
  hasAudio: boolean;
  sourceHasAudio: boolean;
  creditsBefore: number | null;
  creditsAfter: number | null;
  creditsSpent: number | null;
  elapsedMs: number;
  videoUrl: string | null;
  cached: boolean;
}

export interface RenderOptions {
  characterId?: string;
  imagePath?: string;
  backgroundMode?: "original" | "solid" | "transparent";
  force?: boolean;
}

/**
 * Sends the downloaded TikTok as the driving motion and our face as the character.
 * Answers: does Viggle take a full-length TikTok MP4, how long does it take, what
 * does it actually cost, and does the output keep the original audio?
 */
export async function renderWithFace(
  postId: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const dir = await runDir(postId);

  if (!(await dir.exists(FILES.sourceVideo))) {
    throw new Error(`No ${dir.display(FILES.sourceVideo)} — run step 02 for this post first.`);
  }

  // The character has to be resolved before the cache check: a render is only
  // reusable if it was driven by the same face, not merely the same post.
  const character =
    options.characterId ??
    (await ensureCharacter({ imagePath: options.imagePath, force: false })).characterId;

  if (!options.force && (await dir.exists(FILES.renderVideo))) {
    const previous = await dir.readJson<RenderResult>(FILES.render).catch(() => null);
    if (previous?.characterId === character) {
      step("Rendering with your face (cached)");
      ok(`Reusing ${dir.display(FILES.renderVideo)} — pass --force to render again`);
      return { ...previous, cached: true };
    }
    warn(
      `${dir.display(FILES.renderVideo)} was rendered with ${previous?.characterId ?? "an unknown character"}, ` +
        `not ${character} — rendering again and overwriting it.`,
    );
  }

  step("Rendering with your face");
  const motionVideo = await dir.readBytes(FILES.sourceVideo);
  const sourceHasAudio = hasAudioTrack(motionVideo);

  const creditsBefore = await readBalance();
  info(`character: ${character}`);
  info(`motion:    ${dir.display(FILES.sourceVideo)} (${formatBytes(motionVideo.length)})`);
  info(`credits:   ${creditsBefore ?? "?"} before`);

  const elapsed = timer();
  const created = await createRender({
    characterId: character,
    motionVideo: {
      bytes: motionVideo,
      filename: `${postId}.mp4`,
      contentType: "video/mp4",
    },
    backgroundMode: options.backgroundMode ?? "original",
  });
  detail(`created ${created.id} (${created.status})`);

  const render = await pollUntilTerminal(() => getRender(created.id), {
    label: "render",
    timeoutMs: RENDER_TIMEOUT_MS,
  });
  assertReady(render, "Render");
  const elapsedMs = elapsed();
  ok(`Render ${render.id} ready in ${formatMs(elapsedMs)}`);

  // Output URLs live one hour — grab the bytes before anything else.
  const bytes = await downloadRender(render.id);
  await dir.writeBytes(FILES.renderVideo, bytes);
  const hasAudio = hasAudioTrack(bytes);

  const creditsAfter = await readBalance();
  const creditsSpent =
    creditsBefore != null && creditsAfter != null
      ? Number((creditsBefore - creditsAfter).toFixed(2))
      : null;

  const result: RenderResult = {
    renderId: render.id,
    characterId: character,
    path: dir.file(FILES.renderVideo),
    bytes: bytes.length,
    hasAudio,
    sourceHasAudio,
    creditsBefore,
    creditsAfter,
    creditsSpent,
    elapsedMs,
    videoUrl: render.video_url ?? null,
    cached: false,
  };
  await dir.writeJson(FILES.render, { ...result, render });

  ok(`Saved ${dir.display(FILES.renderVideo)} — ${formatBytes(bytes.length)}`);
  info(`credits:  ${creditsAfter ?? "?"} after${creditsSpent != null ? ` (spent ${creditsSpent})` : ""}`);
  info(`audio:    source ${sourceHasAudio ? "yes" : "no"} → render ${hasAudio ? "yes" : "no"}`);
  if (sourceHasAudio && !hasAudio) {
    warn("Viggle dropped the audio track — the app will have to mux the original sound back in.");
  }
  detail(`open it with: open ${dir.display(FILES.renderVideo)}`);

  return result;
}

/** A failed balance read must not sink an otherwise good render. */
async function readBalance(): Promise<number | null> {
  try {
    return (await getCredits()).balance;
  } catch {
    return null;
  }
}
