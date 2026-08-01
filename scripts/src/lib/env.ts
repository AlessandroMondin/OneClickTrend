import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** scripts/ — src/lib/env.ts sits two levels down. */
export const SCRIPTS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const OUT_DIR = resolve(SCRIPTS_ROOT, "out");
export const FACE_DIR = resolve(SCRIPTS_ROOT, "assets/face");

config({ path: resolve(SCRIPTS_ROOT, ".env") });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} — copy scripts/.env.example to scripts/.env and fill it in.`);
  }
  return value;
}

/**
 * Keys are read lazily so a script that only talks to one service does not fail
 * on the other service's missing token.
 */
export const env = {
  get apifyToken(): string {
    return required("APIFY_TOKEN");
  },
  get viggleApiKey(): string {
    return required("VIGGLE_API_KEY");
  },
  /** clockworks/tiktok-scraper */
  actorId: process.env.APIFY_ACTOR_ID?.trim() || "GdWCkxBtKWOsKjdch",
  viggleBaseUrl: (process.env.VIGGLE_BASE_URL?.trim() || "https://apis.viggle.ai").replace(/\/$/, ""),
};
