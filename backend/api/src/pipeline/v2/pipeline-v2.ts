import { fetchTikTok } from "../01-fetch-tiktok";
import { downloadVideo } from "../02-download-video";
import { errorMessage, formatBytes, formatMs, info, ok, step, timer } from "../lib/log";
import { FILES, type RunDir } from "../lib/run-store";
import { checkKeysV2 } from "./00-check-keys";
import { renderWithRunway, type RunwayRenderOptions } from "./03-render-runway";
import { CREDIT_USD } from "./lib/runway";

type StepStatus = "ok" | "cached" | "failed";

interface StepRecord {
  step: string;
  status: StepStatus;
  ms: number;
  notes: string[];
}

interface ReportV2 {
  version: 2;
  provider: "runway";
  postId: string | null;
  inputUrl: string;
  canonicalUrl: string | null;
  finishedAt: string;
  totalMs: number;
  steps: StepRecord[];
  costs: { apifyUsd: number | null; runwayCredits: number | null; runwayUsd: number | null };
  findings: Record<string, string>;
  outputs: Record<string, string>;
}

/**
 * Same chain as v1 up to the downloaded MP4, then Runway instead of Viggle for
 * the render — `gemini_omni_flash` by default, the only model that survived the
 * bake-off (see MODELS in lib/runway.ts). Artifacts land in the same
 * out/<postId>/ folder under per-model names, so renders can be compared.
 */
export async function runPipelineV2(
  input: string,
  options: RunwayRenderOptions = {},
): Promise<ReportV2> {
  const total = timer();
  const steps: StepRecord[] = [];
  const findings: Record<string, string> = {};
  const outputs: Record<string, string> = {};
  let report!: ReportV2;
  let dir: RunDir | null = null;
  let canonicalUrl: string | null = null;
  let postId: string | null = null;
  let apifyUsd: number | null = null;
  let runwayCredits: number | null = null;

  try {
    await track(steps, "check-keys", () => checkKeysV2(options.model ?? "gemini_omni_flash"), (keys) => ({
      notes: [`apify: ${keys.apifyUser}`, `runway credits: ${keys.runwayCredits}`],
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

    const downloaded = await track(
      steps,
      "download-video",
      () => downloadVideo(fetched.post.postId, options),
      (result) => ({
        cached: result.cached,
        notes: [formatBytes(result.bytes), `audio ${result.hasAudio ? "yes" : "no"}`],
      }),
    );

    outputs.sourceVideo = downloaded.path;

    const rendered = await track(
      steps,
      "render-runway",
      () => renderWithRunway(fetched.post.postId, options),
      (result) => ({
        cached: result.cached,
        notes: [
          result.model,
          `${result.duration}s @ ${result.ratio}`,
          formatBytes(result.bytes),
          result.creditsSpent != null ? `${result.creditsSpent} credits` : "cost unknown",
        ],
      }),
    );

    outputs.renderVideo = rendered.path;
    runwayCredits = rendered.creditsSpent;

    findings.durationCeiling = rendered.trimmed
      ? `The ${rendered.sourceDurationS?.toFixed(1) ?? "?"}s source was trimmed to ${rendered.duration}s to fit ${rendered.model}'s ceiling (15s for Seedance, 30s for act_two).`
      : `Source fit inside ${rendered.model}'s ceiling; rendered ${rendered.duration}s untrimmed.`;
    findings.renderCost = rendered.cached
      ? "Reused a previous render; no credits spent."
      : `${rendered.creditsSpent ?? rendered.estimatedCredits} credits (~$${((rendered.creditsSpent ?? rendered.estimatedCredits) * CREDIT_USD).toFixed(2)}) ` +
        `for ${rendered.duration}s of ${rendered.model}, done in ${formatMs(rendered.elapsedMs)}.`;
    findings.identityTransfer =
      rendered.model === "act_two"
        ? "act_two drives the face photo with the TikTok as a reference performance — the v1 Viggle model, " +
          "so the output keeps the photo's environment rather than the TikTok's background."
        : "Seedance re-generates the clip from the face reference rather than compositing a swap — " +
          "check how well the identity and the original background survived.";
    findings.audio = `source ${rendered.sourceHasAudio ? "has" : "has no"} audio → render ${
      rendered.hasAudio ? "has" : "has no"
    } audio (Runway generates its own track; it does not carry the original over).`;
  } finally {
    report = {
      version: 2,
      provider: "runway",
      postId,
      inputUrl: input,
      canonicalUrl,
      finishedAt: new Date().toISOString(),
      totalMs: total(),
      steps,
      costs: {
        apifyUsd,
        runwayCredits,
        runwayUsd: runwayCredits != null ? Number((runwayCredits * CREDIT_USD).toFixed(2)) : null,
      },
      findings,
      outputs,
    };

    if (dir) {
      await dir.writeJson(FILES.reportV2, report);
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

function printSummary(report: ReportV2, dir: RunDir | null): void {
  step("Summary (v2 · Runway)");

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
      report.costs.runwayCredits != null
        ? `${report.costs.runwayCredits} runway credits ($${report.costs.runwayUsd?.toFixed(2)})`
        : "— runway credits"
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
    info(`report: ${dir.display(FILES.reportV2)}`);
  }
}
