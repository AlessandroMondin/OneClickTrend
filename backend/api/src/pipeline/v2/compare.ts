import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { detail, errorMessage, formatBytes, formatMs, info, ok, step, timer, warn } from "../lib/log";
import { FILES, runDir, type RunDir } from "../lib/run-store";
import { renderWithRunway, type RunwayRenderOptions } from "./03-render-runway";
import { probe } from "./lib/ffmpeg";
import { CREDIT_USD, estimateCredits, MODELS, organizationInfo, type RenderModel } from "./lib/runway";

const run = promisify(execFile);

/**
 * The models worth putting head to head for "my face in this trend". Seedance is
 * deliberately absent: every attempt was rejected at PENDING by ByteDance, on
 * clips as different as a beach walk and an indoor skit, under three prompt
 * wordings — it refuses a real face reference on a real person's video as a
 * category. aleph2 is out too, since its keyframes are full-frame targets rather
 * than identity references. Pass --models to test them anyway.
 */
export const DEFAULT_COMPARE_MODELS: RenderModel[] = ["gemini_omni_flash", "act_two"];

export interface CompareEntry {
  model: RenderModel;
  provider: string;
  status: "ok" | "cached" | "failed";
  error: string | null;
  /** Runway's machine-readable reason, when the task itself failed. */
  failureCode: string | null;
  path: string | null;
  creditsSpent: number | null;
  estimatedCredits: number;
  elapsedMs: number;
  bytes: number | null;
}

export interface CompareReport {
  postId: string;
  finishedAt: string;
  totalMs: number;
  entries: CompareEntry[];
  creditsBefore: number | null;
  creditsAfter: number | null;
  /**
   * Measured across the whole comparison. Not attributed per model: the runs
   * overlap, so a per-model balance delta would be someone else's charge.
   */
  creditsSpent: number | null;
  contactSheet: string | null;
}

/**
 * Renders one post through several models at once and reports what each cost and
 * whether it survived that provider's input moderation. Different models have
 * separate concurrency budgets on Runway, so they genuinely run in parallel.
 */
export async function compareModels(
  postId: string,
  models: RenderModel[] = DEFAULT_COMPARE_MODELS,
  options: RunwayRenderOptions = {},
): Promise<CompareReport> {
  const dir = await runDir(postId);
  if (!(await dir.exists(FILES.sourceVideo))) {
    throw new Error(`No ${dir.display(FILES.sourceVideo)} — run step 02 for this post first.`);
  }

  const total = timer();
  const creditsBefore = await readBalance();
  const measured = await probe(dir.file(FILES.sourceVideo));
  const seconds = Math.round(measured?.durationS ?? 10);

  step(`Comparing ${models.length} models on post ${postId}`);
  let worstCase = 0;
  for (const model of models) {
    const spec = MODELS[model];
    const credits = estimateCredits(model, Math.min(spec.maxInputS, seconds));
    worstCase += credits;
    info(
      `${model.padEnd(18)} ${spec.provider.padEnd(10)} face as ${spec.face.padEnd(10)} ` +
        `~${credits} credits ($${(credits * CREDIT_USD).toFixed(2)})`,
    );
  }
  info(`worst case if every model succeeds: ${worstCase} credits ($${(worstCase * CREDIT_USD).toFixed(2)})`);

  const entries = await Promise.all(
    models.map(async (model): Promise<CompareEntry> => {
      const elapsed = timer();
      const spec = MODELS[model];
      const estimated = estimateCredits(model, Math.min(spec.maxInputS, seconds));
      try {
        const result = await renderWithRunway(postId, { ...options, model });
        return {
          model,
          provider: spec.provider,
          status: result.cached ? "cached" : "ok",
          error: null,
          failureCode: null,
          path: result.path,
          creditsSpent: result.creditsSpent,
          estimatedCredits: estimated,
          elapsedMs: result.elapsedMs,
          bytes: result.bytes,
        };
      } catch (error) {
        const message = errorMessage(error);
        return {
          model,
          provider: spec.provider,
          status: "failed",
          error: message,
          failureCode: /\[([A-Z0-9_.]+)\]/.exec(message)?.[1] ?? null,
          path: null,
          creditsSpent: null,
          estimatedCredits: estimated,
          elapsedMs: elapsed(),
          bytes: null,
        };
      }
    }),
  );

  const succeeded = entries.filter((entry) => entry.path);
  const contactSheet = succeeded.length > 0 ? await buildContactSheet(dir, succeeded) : null;

  const creditsAfter = await readBalance();
  const report: CompareReport = {
    postId,
    finishedAt: new Date().toISOString(),
    totalMs: total(),
    entries,
    creditsBefore,
    creditsAfter,
    creditsSpent:
      creditsBefore != null && creditsAfter != null ? creditsBefore - creditsAfter : null,
    contactSheet,
  };
  await dir.writeJson(FILES.compareV2, report);

  printSummary(report, dir);
  return report;
}

function printSummary(report: CompareReport, dir: RunDir): void {
  step("Comparison");
  const width = Math.max(...report.entries.map((entry) => entry.model.length));

  for (const entry of report.entries) {
    const mark = entry.status === "failed" ? "✗" : entry.status === "cached" ? "•" : "✓";
    // Never claim a failure was free: only INPUT_PREPROCESSING.* is rejected
    // before the model runs. A SAFETY.INPUT.* verdict lands after generation has
    // started and Runway does not refund it.
    const cost = entry.status === "cached" ? "cached" : `~${entry.estimatedCredits} credits est.`;
    const tail = entry.status === "failed" ? (entry.failureCode ?? entry.error) : formatBytes(entry.bytes ?? 0);
    info(
      `${mark} ${entry.model.padEnd(width)}  ${entry.provider.padEnd(10)}  ` +
        `${formatMs(entry.elapsedMs).padStart(7)}  ${cost.padEnd(22)}  ${tail}`,
    );
  }

  console.log("");
  info(
    report.creditsSpent != null
      ? `spent: ${report.creditsSpent} credits ($${(report.creditsSpent * CREDIT_USD).toFixed(2)}) measured, ` +
        `${report.creditsBefore} → ${report.creditsAfter}, in ${formatMs(report.totalMs)}`
      : `spent: could not read the balance — check the dev portal (${formatMs(report.totalMs)})`,
  );
  if (report.entries.some((entry) => entry.failureCode?.startsWith("SAFETY.INPUT"))) {
    warn("SAFETY.INPUT.* failures are billed — Runway does not refund them.");
  }
  if (report.contactSheet) {
    ok(`contact sheet: ${report.contactSheet}`);
  }
  for (const entry of report.entries.filter((e) => e.path)) {
    detail(`open ${entry.path}`);
  }
  info(`report: ${dir.display(FILES.compareV2)}`);
}

/** A failed balance read must not sink the comparison. */
async function readBalance(): Promise<number | null> {
  try {
    return (await organizationInfo()).balance;
  } catch {
    return null;
  }
}

/**
 * Stacks three evenly spaced frames from each successful render into one JPEG,
 * which is the fastest way to judge identity and motion side by side without
 * scrubbing every clip.
 */
async function buildContactSheet(
  dir: RunDir,
  entries: CompareEntry[],
): Promise<string | null> {
  const output = dir.file("compare-v2.jpg");
  const inputs = [dir.file(FILES.sourceVideo), ...entries.map((entry) => entry.path!)];

  // One row per clip: the source on top, then each model's render below it.
  const args: string[] = ["-y", "-v", "error"];
  for (const input of inputs) args.push("-i", input);

  const rows = inputs
    .map((_, index) => `[${index}:v]select='eq(n\\,2)+eq(n\\,30)+eq(n\\,60)',scale=240:-2,tile=3x1[r${index}]`)
    .join(";");
  const stack =
    inputs.length > 1
      ? `${inputs.map((_, index) => `[r${index}]`).join("")}vstack=inputs=${inputs.length}[out]`
      : "[r0]null[out]";

  try {
    await run("ffmpeg", [...args, "-filter_complex", `${rows};${stack}`, "-map", "[out]", "-frames:v", "1", output]);
    return output;
  } catch (error) {
    warn(`could not build the contact sheet: ${errorMessage(error)}`);
    return null;
  }
}
