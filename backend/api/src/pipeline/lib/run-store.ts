import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { API_ROOT, OUT_DIR } from "./env";

/**
 * Every artifact for one TikTok post lives in `out/<postId>/`, which is what makes
 * the steps individually re-runnable: step 4 can be retried without paying Apify
 * for another scrape.
 */
export class RunDir {
  constructor(
    readonly postId: string,
    readonly path: string,
  ) {}

  file(name: string): string {
    return join(this.path, name);
  }

  /** Path relative to backend/api, for readable log lines. */
  display(name: string): string {
    return relative(API_ROOT, this.file(name));
  }

  async exists(name: string): Promise<boolean> {
    try {
      const stats = await stat(this.file(name));
      return stats.size > 0;
    } catch {
      return false;
    }
  }

  async size(name: string): Promise<number> {
    return (await stat(this.file(name))).size;
  }

  async readJson<T>(name: string): Promise<T> {
    return JSON.parse(await readFile(this.file(name), "utf8")) as T;
  }

  async writeJson(name: string, value: unknown): Promise<void> {
    await writeFile(this.file(name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  async readBytes(name: string): Promise<Buffer> {
    return readFile(this.file(name));
  }

  async writeBytes(name: string, bytes: Uint8Array): Promise<void> {
    await writeFile(this.file(name), bytes);
  }
}

export async function runDir(postId: string): Promise<RunDir> {
  const path = join(OUT_DIR, postId);
  await mkdir(path, { recursive: true });
  return new RunDir(postId, path);
}

export const FILES = {
  resolvedUrl: "resolved-url.json",
  item: "item.json",
  run: "run.json",
  sourceVideo: "source.mp4",
  download: "download.json",
  render: "render.json",
  renderVideo: "render.mp4",
  report: "report.json",
} as const;
