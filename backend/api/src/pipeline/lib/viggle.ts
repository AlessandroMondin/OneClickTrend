import { File } from "node:buffer";
import { env } from "./env";
import { detail, formatMs } from "./log";

export interface ViggleErrorBody {
  code: string;
  message: string;
  request_id?: string;
}

export class ViggleApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
    readonly requestId?: string,
  ) {
    super(`Viggle ${status} ${code}: ${detail}${requestId ? ` (request_id ${requestId})` : ""}`);
    this.name = "ViggleApiError";
  }
}

interface Asset {
  id: string;
  status: string;
  name?: string;
  progress?: number | null;
  capabilities?: string[];
  created_at?: string | null;
  completed_at?: string | null;
  error?: ViggleErrorBody | null;
}

export interface Character extends Asset {}

export interface Render extends Asset {
  stage?: string | null;
  video_url?: string | null;
  alpha_url?: string | null;
}

export interface UploadFile {
  bytes: Buffer;
  filename: string;
  contentType: string;
}

const TERMINAL_STATUSES = new Set(["ready", "failed", "cancelled"]);
const RETRIABLE_ATTEMPTS = 3;

interface RequestOptions {
  method?: string;
  body?: RequestInit["body"];
  /** Only ever true for GETs — create calls are not idempotent (no idempotency keys in V1). */
  retry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, retry = method === "GET" } = options;
  const attempts = retry ? RETRIABLE_ATTEMPTS : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // Content-Type is deliberately unset: fetch has to generate the multipart boundary.
    const response = await fetch(`${env.viggleBaseUrl}${path}`, {
      method,
      body,
      headers: { authorization: `Bearer ${env.viggleApiKey}` },
    });

    if (response.ok) return (await response.json()) as T;

    const error = await toApiError(response);
    // 4xx is caller error; retrying without changing the request just wastes time.
    if (response.status < 500 || attempt === attempts) throw error;

    lastError = error;
    const backoffMs = 500 * 2 ** (attempt - 1);
    detail(`${error.message} — retrying in ${formatMs(backoffMs)}`);
    await sleep(backoffMs);
  }

  throw lastError;
}

async function toApiError(response: Response): Promise<ViggleApiError> {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw) as { error?: ViggleErrorBody };
    if (parsed.error) {
      return new ViggleApiError(
        response.status,
        parsed.error.code,
        parsed.error.message,
        parsed.error.request_id,
      );
    }
  } catch {
    // fall through to the raw body
  }
  return new ViggleApiError(response.status, "unknown", raw.slice(0, 300) || response.statusText);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFile(file: UploadFile): File {
  return new File([file.bytes], file.filename, { type: file.contentType });
}

export async function getCredits(): Promise<{ balance: number }> {
  return request<{ balance: number }>("/v1/credits");
}

export async function createCharacter(image: UploadFile, name?: string): Promise<Character> {
  const form = new FormData();
  form.append("image", toFile(image));
  if (name) form.append("name", name);
  return request<Character>("/v1/characters", { method: "POST", body: form });
}

export async function getCharacter(characterId: string): Promise<Character> {
  return request<Character>(`/v1/characters/${characterId}`);
}

export interface CreateRenderOptions {
  characterId: string;
  motionVideo: UploadFile;
  backgroundMode?: "original" | "solid" | "transparent";
  bgColor?: string;
}

export async function createRender(options: CreateRenderOptions): Promise<Render> {
  const form = new FormData();
  form.append("character_id", options.characterId);
  form.append("motion_video", toFile(options.motionVideo));
  form.append("background_mode", options.backgroundMode ?? "original");
  if (options.bgColor) form.append("bg_color", options.bgColor);
  return request<Render>("/v1/renders", { method: "POST", body: form });
}

export async function getRender(renderId: string): Promise<Render> {
  return request<Render>(`/v1/renders/${renderId}`);
}

/**
 * `GET /v1/renders/{id}/download` answers 302 with a signed URL on another host.
 * The redirect is followed by hand so the Authorization header is never forwarded
 * to the storage bucket, which rejects requests that carry one.
 */
export async function downloadRender(renderId: string): Promise<Buffer> {
  const response = await fetch(`${env.viggleBaseUrl}/v1/renders/${renderId}/download`, {
    redirect: "manual",
    headers: { authorization: `Bearer ${env.viggleApiKey}` },
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error(`Viggle redirected render ${renderId} without a Location header.`);
    return fetchBytes(location);
  }

  if (!response.ok) throw await toApiError(response);
  return Buffer.from(await response.arrayBuffer());
}

export async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export interface PollOptions {
  label: string;
  timeoutMs: number;
  intervalMs?: number;
}

/**
 * Polls an async V1 resource until it reaches a terminal status. The docs
 * recommend 3–5s between checks; there are no webhooks in V1.
 */
export async function pollUntilTerminal<T extends Render | Character>(
  fetcher: () => Promise<T>,
  options: PollOptions,
): Promise<T> {
  const { label, timeoutMs, intervalMs = 3000 } = options;
  const deadline = Date.now() + timeoutMs;
  let lastLine = "";

  for (;;) {
    const resource = await fetcher();
    const stage = "stage" in resource ? resource.stage : null;
    const line = [resource.status, stage, resource.progress != null ? `${resource.progress}%` : null]
      .filter(Boolean)
      .join(" · ");
    if (line !== lastLine) {
      detail(`${label}: ${line}`);
      lastLine = line;
    }

    if (TERMINAL_STATUSES.has(resource.status)) return resource;

    if (Date.now() >= deadline) {
      throw new Error(
        `${label} still ${resource.status} after ${formatMs(timeoutMs)} — id ${resource.id}. ` +
          "It may still finish; re-run this step to keep polling.",
      );
    }
    await sleep(intervalMs);
  }
}

export function assertReady(resource: Render | Character, label: string): void {
  if (resource.status === "ready") return;
  const reason = resource.error ? `${resource.error.code}: ${resource.error.message}` : resource.status;
  throw new Error(`${label} ${resource.id} did not become ready — ${reason}`);
}
