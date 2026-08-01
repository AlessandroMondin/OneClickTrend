import { checkKeys } from "./00-check-keys";
import { fetchTikTok } from "./01-fetch-tiktok";
import { downloadVideo } from "./02-download-video";
import { ensureCharacter } from "./03-create-character";
import { renderWithFace, type RenderOptions } from "./04-render";
import { errorMessage, formatBytes, formatMs, info, ok, step, timer } from "./lib/log";
import { FILES, type RunDir } from "./lib/run-store";

type StepStatus = "ok" | "cached" | "failed";

interface StepRecord {
  step: string;
  status: StepStatus;
  ms: number;
  notes: string[];
}

interface Report {
  postId: string | null;
  inputUrl: string;
  canonicalUrl: string | null;
  finishedAt: string;
  totalMs: number;
  steps: StepRecord[];
  costs: { apifyUsd: number | null; viggleCredits: number | null };
  findings: Record<string, string>;
  outputs: Record<string, string>;
}

/**
 * Runs the whole chain for one TikTok URL and writes out/<postId>/report.json.
 * Steps whose artifact already exists are reused, so re-running never pays Apify
 * or Viggle twice — pass --force to redo everything.
 */
export async function runPipeline(input: string, options: RenderOptions = {}): Promise<Report> {
  const total = timer();
  const steps: StepRecord[] = [];
  const findings: Record<string, string> = {};
  const outputs: Record<string, string> = {};
  let report!: Report;
  let dir: RunDir | null = null;
  let canonicalUrl: string | null = null;
  let postId: string | null = null;
  let apifyUsd: number | null = null;
  let viggleCredits: number | null = null;

  try {
    await track(steps, "check-keys", () => checkKeys(), (keys) => ({
      notes: [`apify: ${keys.apifyUser}`, `viggle balance: ${keys.viggleBalance}`],
    }));

    const fetched = await track(steps, "fetch-tiktok", () => fetchTikTok(input, options), (result) => ({
      cached: result.cached,
      notes: [
        `post ${result.post.postId}`,
        `duration ${result.item.videoMeta?.duration ?? "?"}s`,
        result.run ? `apify run ${result.run.runId}` : "reused item.json",
      ],
    }));

    dir = fetched.dir;
    postId = fetched.post.postId;
    canonicalUrl = fetched.post.canonicalUrl;
    apifyUsd = fetched.run?.usageTotalUsd ?? null;

    findings.shortLinkHandling = fetched.post.wasShortLink
      ? `Share link resolved locally to ${fetched.post.canonicalUrl} before calling the actor.`
      : "Input was already a canonical post URL; no redirect needed.";
    findings.apifyRunCost = fetched.run
      ? `${fetched.run.usageTotalUsd != null ? `$${fetched.run.usageTotalUsd.toFixed(4)}` : "not reported"} in ${formatMs(fetched.run.elapsedMs)} for 1 post.`
      : "Reused a cached dataset item; no actor run this time.";

    const downloaded = await track(
      steps,
      "download-video",
      () => downloadVideo(fetched.post.postId, options),
      (result) => ({
        cached: result.cached,
        notes: [
          formatBytes(result.bytes),
          `auth ${result.authRequired ? "required" : "not required"}`,
          `audio ${result.hasAudio ? "yes" : "no"}`,
        ],
      }),
    );

    outputs.sourceVideo = downloaded.path;
    findings.videoHosting = `${new URL(downloaded.sourceUrl).hostname} — ${
      downloaded.authRequired ? "needs the Apify token" : "publicly fetchable"
    }. Apify keeps unnamed key-value stores ~7 days, so production must copy the file out.`;

    const character = await track(
      steps,
      "create-character",
      () => ensureCharacter({ imagePath: options.imagePath, force: options.force }),
      (result) => ({
        cached: result.cached,
        notes: [result.characterId, result.cached ? "reused" : "created"],
      }),
    );

    findings.characterReuse = character.cached
      ? `Reused Character ${character.characterId} from a previous run — 0 credits.`
      : `Created Character ${character.characterId} (1 credit); cached by image hash for later runs.`;

    const rendered = await track(
      steps,
      "render",
      () => renderWithFace(fetched.post.postId, { ...options, characterId: character.characterId }),
      (result) => ({
        cached: result.cached,
        notes: [
          result.renderId,
          formatBytes(result.bytes),
          result.creditsSpent != null ? `${result.creditsSpent} credits` : "cost unknown",
        ],
      }),
    );

    outputs.renderVideo = rendered.path;
    viggleCredits = rendered.creditsSpent;

    const duration = fetched.item.videoMeta?.duration;
    findings.renderCost = rendered.cached
      ? "Reused a previous render; no credits spent."
      : `${rendered.creditsSpent ?? "?"} credits for a ${duration ?? "?"}s source, rendered in ${formatMs(rendered.elapsedMs)}.`;
    findings.fullLengthAccepted = rendered.cached
      ? "Not re-tested this run (cached render)."
      : `Viggle accepted the full ${formatBytes(downloaded.bytes)} / ${duration ?? "?"}s TikTok MP4 as the motion source.`;
    findings.audioPreserved = `source ${rendered.sourceHasAudio ? "has" : "has no"} audio → render ${
      rendered.hasAudio ? "has" : "has no"
    } audio.`;
  } finally {
    report = {
      postId,
      inputUrl: input,
      canonicalUrl,
      finishedAt: new Date().toISOString(),
      totalMs: total(),
      steps,
      costs: { apifyUsd, viggleCredits },
      findings,
      outputs,
    };

    if (dir) {
      await dir.writeJson(FILES.report, report);
    }
    printSummary(report, dir);
  }

  return report;
}

async function track<T>(
  records: StepRecord[],
  name: string,
  body: () => Promise<T>,
  summarize: (value: T) => { cached?: boolean; notes: string[] },
): Promise<T> {
  const elapsed = timer();
  try {
    const value = await body();
    const { cached, notes } = summarize(value);
    records.push({ step: name, status: cached ? "cached" : "ok", ms: elapsed(), notes });
    return value;
  } catch (error) {
    records.push({ step: name, status: "failed", ms: elapsed(), notes: [errorMessage(error)] });
    throw error;
  }
}

function printSummary(report: Report, dir: RunDir | null): void {
  step("Summary");

  const width = Math.max(...report.steps.map((record) => record.step.length), 10);
  for (const record of report.steps) {
    const mark = record.status === "failed" ? "✗" : record.status === "cached" ? "•" : "✓";
    info(
      `${mark} ${record.step.padEnd(width)}  ${record.status.padEnd(6)}  ${formatMs(record.ms).padStart(6)}  ${record.notes.join(" · ")}`,
    );
  }

  console.log("");
  info(`total: ${formatMs(report.totalMs)}`);
  info(
    `cost:  ${report.costs.apifyUsd != null ? `$${report.costs.apifyUsd.toFixed(4)} apify` : "$— apify"} · ${
      report.costs.viggleCredits != null ? `${report.costs.viggleCredits} viggle credits` : "— viggle credits"
    }`,
  );

  if (Object.keys(report.findings).length > 0) {
    console.log("");
    step("Findings");
    for (const [key, value] of Object.entries(report.findings)) {
      info(`${key}: ${value}`);
    }
  }

  if (report.outputs.renderVideo) {
    console.log("");
    ok(`open ${report.outputs.renderVideo}`);
  }
  if (dir) {
    info(`report: ${dir.display(FILES.report)}`);
  }
}
