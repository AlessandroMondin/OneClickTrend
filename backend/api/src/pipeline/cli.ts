import "dotenv/config";

import { checkKeys } from "./00-check-keys";
import { fetchTikTok } from "./01-fetch-tiktok";
import { downloadVideo } from "./02-download-video";
import { ensureCharacter } from "./03-create-character";
import { renderWithFace, type RenderOptions } from "./04-render";
import { flagValue, hasFlag, parseArgs } from "./lib/cli";
import { errorMessage, fail } from "./lib/log";
import { runPipeline } from "./pipeline";
import { smokeTest } from "./smoke-test";
import { checkKeysV2 } from "./v2/00-check-keys";
import { renderWithRunway, type RunwayRenderOptions } from "./v2/03-render-runway";
import { compareModels, DEFAULT_COMPARE_MODELS } from "./v2/compare";
import { isRenderModel, RENDER_MODELS, type RenderModel } from "./v2/lib/runway";
import { runPipelineV2 } from "./v2/pipeline-v2";

const USAGE = `Usage: pnpm --filter @oneclicktrend/api <command>

v1 (Viggle)
  check                       validate APIFY_TOKEN and VIGGLE_API_KEY
  fetch "<tiktok url>"        resolve + scrape a post (Apify)
  download <postId>           fetch the source MP4
  character [--image path]    create/reuse the Viggle character
  render <postId>             render with the character
  pipeline "<tiktok url>"     run the whole chain

v2 (Runway · Seedance 2.0)
  check-v2                    validate APIFY_TOKEN and RUNWAYML_API_SECRET
  render-v2 <postId>          re-render an already downloaded post
  pipeline-v2 "<tiktok url>"  run the whole chain through Runway
  compare-v2 <postId>         render the post through several models at once

Flags: --image <path>, --character char_xxx,
       --background original|solid|transparent, --force,
       --with-audio/--without-audio (smoke)
v2 flags: --model gemini_omni_flash (default)|act_two|aleph2|seedance2*,
       --prompt "<text>" (seedance only), --duration <s>, --ratio 720:1280,
       --no-audio, --no-body-control (act_two), --models a,b,c (compare-v2)`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const renderOptions: RenderOptions = {
    characterId: flagValue(args, "character"),
    imagePath: flagValue(args, "image"),
    backgroundMode: flagValue(args, "background") as RenderOptions["backgroundMode"],
    force: hasFlag(args, "force"),
  };
  const runwayOptions: RunwayRenderOptions = {
    model: parseModel(flagValue(args, "model")),
    imagePath: renderOptions.imagePath,
    promptText: flagValue(args, "prompt"),
    ratio: flagValue(args, "ratio"),
    duration: parseDuration(flagValue(args, "duration")),
    audio: hasFlag(args, "no-audio") ? false : undefined,
    bodyControl: hasFlag(args, "no-body-control") ? false : undefined,
    force: renderOptions.force,
  };

  switch (command) {
    case "check":
      await checkKeys();
      return;
    case "fetch": {
      const url = args.positional[0];
      if (!url) throw new Error('Usage: fetch "<tiktok url>" [--force]');
      await fetchTikTok(url, { force: renderOptions.force });
      return;
    }
    case "download": {
      const postId = args.positional[0];
      if (!postId) throw new Error("Usage: download <postId> [--force]");
      await downloadVideo(postId, { force: renderOptions.force });
      return;
    }
    case "character":
      await ensureCharacter({
        imagePath: renderOptions.imagePath,
        force: renderOptions.force,
      });
      return;
    case "render": {
      const postId = args.positional[0];
      if (!postId) throw new Error("Usage: render <postId> [--character char_xxx] [--image path]");
      await renderWithFace(postId, renderOptions);
      return;
    }
    case "pipeline": {
      const url = args.positional[0];
      if (!url) throw new Error('Usage: pipeline "<tiktok url>" [--image path] [--force]');
      await runPipeline(url, renderOptions);
      return;
    }
    case "check-v2":
      await checkKeysV2(runwayOptions.model ?? "gemini_omni_flash");
      return;
    case "render-v2": {
      const postId = args.positional[0];
      if (!postId) throw new Error("Usage: render-v2 <postId> [--image path] [--model seedance2]");
      await renderWithRunway(postId, runwayOptions);
      return;
    }
    case "pipeline-v2": {
      const url = args.positional[0];
      if (!url) throw new Error('Usage: pipeline-v2 "<tiktok url>" [--image path] [--force]');
      await runPipelineV2(url, runwayOptions);
      return;
    }
    case "compare-v2": {
      const postId = args.positional[0];
      if (!postId) throw new Error("Usage: compare-v2 <postId> [--models a,b] [--image path]");
      const list = flagValue(args, "models");
      const models = list ? list.split(",").map((name) => parseModel(name.trim())!) : DEFAULT_COMPARE_MODELS;
      await compareModels(postId, models, runwayOptions);
      return;
    }
    case "smoke":
      await smokeTest({
        withAudio: flagValue(args, "with-audio"),
        withoutAudio: flagValue(args, "without-audio"),
      });
      return;
    default:
      console.log(USAGE);
      if (command) {
        throw new Error(`Unknown command: ${command}`);
      }
  }
}

function parseModel(value: string | undefined): RenderModel | undefined {
  if (!value) return undefined;
  if (!isRenderModel(value)) {
    throw new Error(`Unknown --model ${value}. Use one of: ${RENDER_MODELS.join(", ")}.`);
  }
  return value;
}

function parseDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isInteger(seconds)) throw new Error(`--duration must be a whole number of seconds.`);
  return seconds;
}

main().catch((error) => {
  console.error("");
  fail(errorMessage(error));
  process.exitCode = 1;
});
