# API validation scripts

A harness for the core OneClickTrend loop — **TikTok share URL → source video → the
same video rendered with your face** — run against the live APIs so we know what
works and what it costs before any of it lands in `backend/api`.

Two services carry the loop:

| Service | What we use it for |
| --- | --- |
| Apify actor `GdWCkxBtKWOsKjdch` (clockworks/tiktok-scraper) | post metadata + an Apify-hosted copy of the MP4 |
| [Viggle API V1](https://docs.viggle.ai/v1/introduction) (`https://apis.viggle.ai`) | Character from your photo, Render driven by the TikTok video |

## Setup

```bash
cp scripts/.env.example scripts/.env    # then fill APIFY_TOKEN and VIGGLE_API_KEY
cp ~/Pictures/me.jpg scripts/assets/face/face.jpg
pnpm install                            # from the repo root
```

Both `scripts/.env` and everything in `assets/face/` are gitignored.

## Running

```bash
pnpm --filter @oneclicktrend/scripts check
pnpm --filter @oneclicktrend/scripts pipeline "https://vm.tiktok.com/XXXXXXXX/"
```

Each step is also runnable on its own, because they hand artifacts to each other
through `out/<postId>/` rather than through memory:

| Script | Command | Reads | Writes |
| --- | --- | --- | --- |
| `00-check-keys.ts` | `pnpm ... check` | — | — |
| `01-fetch-tiktok.ts` | `pnpm ... fetch "<url>"` | — | `resolved-url.json`, `item.json`, `run.json` |
| `02-download-video.ts` | `pnpm ... download <postId>` | `item.json` | `source.mp4`, `download.json` |
| `03-create-character.ts` | `pnpm ... character [--image path]` | `assets/face/` | `assets/face/.character.json` |
| `04-render.ts` | `pnpm ... render <postId>` | `source.mp4` | `render.mp4`, `render.json` |
| `pipeline.ts` | `pnpm ... pipeline "<url>"` | all of the above | `report.json` |
| `smoke-test.ts` | `pnpm ... smoke` | — | — |

`smoke` exercises the pure helpers (arg parsing, URL resolution, carousel
detection, the audio probe) without touching either API — useful with no keys and
no credits. Pass `--with-audio a.mp4 --without-audio b.mp4` to check the audio
probe against real fixtures.

A step that finds its output already on disk reuses it and spends nothing. Add
`--force` to redo the work — including paying for another Apify run or render.

Other flags: `--image <path>` to use a face photo outside `assets/face/`,
`--character char_xxx` to skip character resolution, and
`--background original|solid|transparent` for the render's background mode.

## What each step validates

**01 — resolve + scrape.** Share links (`vm.tiktok.com/…`) are redirectors, so the
URL is resolved to a canonical `https://www.tiktok.com/@handle/video/<id>` first and
*that* is what goes into `postURLs`. A `/photo/` path exits here: Viggle transfers
motion from a driving video, and a photo carousel has none. The actor runs with
`shouldDownloadVideos: true`, which is the flag that makes it rewrite
`videoMeta.downloadAddr` to an `api.apify.com` key-value-store URL instead of an
expiring, header-gated TikTok CDN link. The step asserts that rewrite happened, and
logs `run.usageTotalUsd` — the real per-post cost.

**02 — download.** Fetches that URL bare first and only retries with the Apify token
if it gets a 401/403, so the report records which is actually needed. Unnamed
key-value stores are kept about 7 days, which is why the bytes get copied to
`out/<postId>/source.mp4` immediately; production should pass
`videoKvStoreIdOrName` to use a named store or push to our own storage.

**03 — character.** `POST /v1/characters` with your photo, polled until `ready`, then
checked for the `video_render` capability. The `char_` id is cached in
`assets/face/.character.json` keyed by the file's SHA-256, so the 1-credit charge is
paid once — this is the same reuse model the app depends on (upload your face once,
render many trends).

**04 — render.** `POST /v1/renders` with `character_id` + the local MP4 as
`motion_video`, polled every 3s (V1 has no webhooks). Output URLs expire one hour
after the render completes, so the bytes are downloaded the moment it turns
`ready`. Credits are read before and after for the true cost, and both files are
checked for an audio track — Viggle's docs do not say whether the original sound
survives.

## Reading the results

`out/<postId>/report.json` holds per-step status, timings, IDs, costs and a
`findings` block; the same thing is printed as a table at the end of a pipeline run.
The findings are the point of this folder — they answer:

1. Does the actor take a short share link, or must we resolve it first?
2. What does a one-post run cost and how long does it take?
3. Is the Apify-hosted MP4 fetchable without auth, and how long does it live?
4. Does Viggle accept a full-length TikTok MP4?
5. How long does a render take and what is the real credit burn?
6. Does the original audio survive the render?
7. Does Character reuse work across renders?

## Notes and gotchas

- **Costs are real.** Viggle bills 1 credit per second of *output* video, so a 30s
  TikTok is ~30 credits per render; a Character is 1 credit. Apify is billed
  per-result plus a video-download charge. Nothing here is free — the caching is
  what keeps iteration cheap.
- **No ffmpeg.** Renders are full-length by design. The audio check is a byte-level
  scan for an MP4 `soun` handler box, not a real probe.
- Multipart bodies use `FormData` + `File` with the `Content-Type` header left
  unset, so `fetch` generates the boundary. Setting it by hand breaks the upload.
- V1 has no idempotency keys, so create calls are never retried automatically —
  only GETs retry, on 5xx, with backoff.
- Node 22 (`.nvmrc`) is required: `fetch`, `FormData`, `File` and `Blob` are all
  used as globals, which is why there is no axios/node-fetch/form-data here.
