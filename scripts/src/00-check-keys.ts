import { whoAmI } from "./lib/apify";
import { runCli } from "./lib/cli";
import { env } from "./lib/env";
import { info, ok, step, warn } from "./lib/log";
import { getCredits } from "./lib/viggle";

export interface KeyCheck {
  apifyUser: string;
  viggleBalance: number;
}

/** Proves both tokens are live before any later step spends money. */
export async function checkKeys(): Promise<KeyCheck> {
  step("Checking API keys");

  const user = await whoAmI();
  const apifyUser = user.username ?? "(unnamed account)";
  ok(`Apify token valid — ${apifyUser}`);
  info(`actor: ${env.actorId}`);

  const { balance } = await getCredits();
  ok(`Viggle key valid — ${balance} credits`);
  info(`base url: ${env.viggleBaseUrl}`);

  // 1 credit per second of output, so this is roughly "seconds of video left".
  if (balance < 30) {
    warn(`Only ${balance} credits left — a full-length TikTok render may not fit.`);
  }

  return { apifyUser, viggleBalance: balance };
}

await runCli(import.meta.url, async () => {
  await checkKeys();
});
