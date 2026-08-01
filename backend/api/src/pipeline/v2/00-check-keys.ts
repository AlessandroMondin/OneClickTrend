import { whoAmI } from "../lib/apify";
import { env } from "../lib/env";
import { info, ok, step, warn } from "../lib/log";
import {
  CREDIT_USD,
  CREDITS_PER_SECOND,
  organizationInfo,
  type RenderModel,
} from "./lib/runway";

export interface KeyCheckV2 {
  apifyUser: string;
  runwayCredits: number;
  model: RenderModel;
}

/** Proves the Apify and Runway tokens are live before any later step spends money. */
export async function checkKeysV2(model: RenderModel = "gemini_omni_flash"): Promise<KeyCheckV2> {
  step("Checking API keys (v2 · Runway)");

  const user = await whoAmI();
  const apifyUser = user.username ?? "(unnamed account)";
  ok(`Apify token valid — ${apifyUser}`);
  info(`actor: ${env.actorId}`);

  const org = await organizationInfo(model);
  ok(`Runway key valid — ${org.balance} credits (~$${(org.balance * CREDIT_USD).toFixed(2)})`);
  info(`base url: ${env.runwayBaseUrl}`);
  info(
    `${model}: ${CREDITS_PER_SECOND[model]} credits/s · ` +
      `${org.usedToday ?? 0}/${org.maxDaily ?? "?"} generations today · ` +
      `${org.maxConcurrent ?? "?"} concurrent`,
  );

  // A 10s render on the default model is 360 credits, so "few hundred" is thin.
  const tenSecondCost = CREDITS_PER_SECOND[model] * 10;
  if (org.balance < tenSecondCost) {
    warn(
      `Only ${org.balance} credits left — a 10s ${model} render costs about ${tenSecondCost}. ` +
        "Top up in the dev portal.",
    );
  }

  return { apifyUser, runwayCredits: org.balance, model };
}
