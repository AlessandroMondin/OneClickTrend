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

const USAGE = `Usage: pnpm --filter @oneclicktrend/api <command>

  check                       validate APIFY_TOKEN and VIGGLE_API_KEY
  fetch "<tiktok url>"        resolve + scrape a post (Apify)
  download <postId>           fetch the source MP4
  character [--image path]    create/reuse the Viggle character
  render <postId>             render with the character
  pipeline "<tiktok url>"     run the whole chain

Flags: --image <path>, --character char_xxx,
       --background original|solid|transparent, --force,
       --with-audio/--without-audio (smoke)`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const renderOptions: RenderOptions = {
    characterId: flagValue(args, "character"),
    imagePath: flagValue(args, "image"),
    backgroundMode: flagValue(args, "background") as RenderOptions["backgroundMode"],
    force: hasFlag(args, "force"),
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

main().catch((error) => {
  console.error("");
  fail(errorMessage(error));
  process.exitCode = 1;
});
