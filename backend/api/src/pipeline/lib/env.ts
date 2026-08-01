import { resolve } from "node:path";

/**
 * Pipeline working directories, all inside backend/api (gitignored):
 * - out/<postId>/ holds per-post artifacts so steps are individually
 *   re-runnable without re-paying Apify or Viggle
 * - data/face/ holds the Viggle character cache
 */
export const API_ROOT = resolve(__dirname, "../../..");
export const OUT_DIR = resolve(API_ROOT, "out");
export const FACE_DIR = resolve(API_ROOT, "data/face");

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} — set it in backend/api/.env.`);
  }
  return value;
}

/**
 * Keys are read lazily so a step that only talks to one service does not fail
 * on the other service's missing token. The API loads backend/api/.env via
 * dotenv at startup.
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
