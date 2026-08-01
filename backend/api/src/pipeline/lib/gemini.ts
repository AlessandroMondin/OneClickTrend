import { env } from "./env";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

interface InlinePart {
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
  text?: string;
}

/**
 * Edits an image with Nano Banana (Gemini image model): the first image is the
 * identity reference, the second is the photo to edit. Returns the edited
 * image bytes.
 */
export async function editImage(
  face: { bytes: Buffer; mimeType: string },
  target: { bytes: Buffer; mimeType: string },
  prompt: string,
): Promise<Buffer> {
  const response = await fetch(
    `${BASE_URL}/models/${env.nanoBananaModel}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: face.mimeType,
                  data: face.bytes.toString("base64"),
                },
              },
              {
                inline_data: {
                  mime_type: target.mimeType,
                  data: target.bytes.toString("base64"),
                },
              },
              { text: prompt },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Gemini ${env.nanoBananaModel} answered HTTP ${response.status}: ${body.slice(0, 400)}`,
    );
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: InlinePart[] } }>;
  };
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data ?? part.inline_data?.data;
    if (data) {
      return Buffer.from(data, "base64");
    }
  }

  const text = parts.map((p) => p.text).filter(Boolean).join(" ");
  throw new Error(
    `Gemini returned no image${text ? ` — model said: ${text.slice(0, 300)}` : ""}`,
  );
}
