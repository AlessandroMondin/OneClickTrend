# OneClickTrend

Turborepo monorepo: React Native app + TypeScript API + Postgres + LocalStack (S3).

## Structure

```
frontend/mobile     React Native app (TypeScript) — Characters & Generations
backend/api         Express API (TypeScript) — characters, media, generations
packages/database   Prisma schema + client (@oneclicktrend/database)
```

## Requirements

- Node 22 (`nvm use`), pnpm, CocoaPods, Xcode, Docker Desktop
- iPhone connected via USB

## Setup

```bash
make install                       # pnpm install + pod install
cp backend/api/.env.example backend/api/.env
cp packages/database/.env.example packages/database/.env
make migrate                       # starts docker (postgres + localstack) + prisma migrate
```

## Run

```bash
# Terminal 1 — API on :3000 (also brings up docker)
make backend

# Terminal 2 — deploy to the connected iPhone (Release build, no Metro needed)
make iphone
```

`make configure-api` (run automatically by `make iphone`) rewrites the app's
`API_URL` and the API's `S3_PUBLIC_ENDPOINT` with the Mac's LAN IP — phone and
Mac must be on the same Wi-Fi.

## App

- **Characters** tab: list characters, "Add a Character" (photos + video from
  gallery or camera), tap a character to see its media.
- **My Generations** tab: user generations (empty for now).

Media flow: the app asks `POST /characters/:id/media` for presigned S3 PUT
URLs, uploads directly to LocalStack, and displays media through the API's
streaming `GET /media/:id` endpoint (Range supported for video).

## Animation pipeline

Tapping **Animate** on a shared link asks for a character, then the API runs
the built-in TikTok → Viggle pipeline (`backend/api/src/pipeline/`)
running in-process with the character's main photo as the face image. It
uploads the rendered video to S3 and marks the Generation `completed`, which then
plays inline in My Generations. Requires real API keys:

```bash
# fill APIFY_TOKEN and VIGGLE_API_KEY in backend/api/.env
```

Without keys the pipeline fails fast and the Generation shows `failed` with the
reason (also logged to `logs/api.log`). Artifacts cache under `backend/api/out/`.

### Pipeline v2 (Runway · Seedance 2.0)

An alternative render backend lives in `backend/api/src/pipeline/v2/`. It reuses
the Apify fetch + download steps and then calls Runway's
`POST /v1/video_to_video` with the TikTok as the input video and the face photo
as an image reference, instead of Viggle's character + motion transfer. The
default model is **`gemini_omni_flash`** — see the bake-off notes below for why.
It needs `RUNWAYML_API_SECRET` in `backend/api/.env` (key from
<https://dev.runwayml.com/>).

```bash
pnpm --filter @oneclicktrend/api check-v2
pnpm --filter @oneclicktrend/api pipeline-v2 "<tiktok url>" --image path/to/face.jpg
```

Two constraints differ from v1: Runway caps `video_to_video` output at **15s**
(longer sources are trimmed with ffmpeg first), and it bills per second —
`seedance2` is 36 credits/s at 720p, i.e. ~$3.60 for 10s, against
`seedance2_mini` at 16. Credits are $0.01 each. Artifacts land next to the v1
ones as `render-v2.mp4` / `report-v2.json`.

`--model act_two` switches to `POST /v1/character_performance` instead: 5
credits/s, 3–30s, no prompt. It is *not* a drop-in replacement — act_two
animates the **face photo** with the TikTok as a driving performance, so the
output keeps the photo's background, not the trend's. Only the Seedance route
puts you inside the original scene.

`compare-v2 <postId> [--models a,b]` renders one post through several models
concurrently and writes `compare-v2.json` plus a `compare-v2.jpg` contact sheet
(source on top, one row per model) for judging the results side by side.

Failures worth knowing, all caused by the source clip rather than by the code:

- `INPUT_PREPROCESSING.SAFETY.THIRD_PARTY` (Seedance/ByteDance) — rejected
  *before* the model runs, so it costs nothing.
- `SAFETY.INPUT.THIRD_PARTY` (gemini_omni_flash/Google) — same class of
  rejection, but it lands after generation started and **Runway does not refund
  it**. Never assume a failed task was free; read the balance.
- `NO_FACE_FOUND` (act_two) — needs a clearly visible face that stays in frame
  in *both* the character image and the driving video. Wide full-body shots fail.

What the failures actually taught us, over two very different posts and three
prompt wordings:

- **Seedance is a dead end for this product.** Every `seedance2*` attempt was
  rejected at `PENDING`, before generating, on both a shirtless beach clip and a
  fully clothed indoor one. ByteDance appears to refuse a real face reference
  applied to a real person's video as a category, whatever the prompt says.
- **`gemini_omni_flash` works.** Same inputs, same prompt: it kept the second
  person, the room, the on-screen text, the gesture and the pacing, and put the
  reference face on the foreground subject with a stable identity across the
  clip. 11 credits/s, ~$0.67 for 6s. It is the model the v2 pipeline should
  build on.
- A clip whose subject is shirtless is rejected by ByteDance *and* Google. A
  good test post is a front-facing, clothed subject whose face stays in frame.

## Other targets

`make simulator`, `make iphone-debug` (+ `make metro`), `make db-up`,
`make db-down`, `make clean`.
