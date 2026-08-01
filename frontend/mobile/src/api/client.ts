import { API_URL } from "../config";
import type {
  Character,
  CharacterDetail,
  Generation,
  UploadTarget,
} from "../types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    console.error(`API ${res.status} ${res.url}: ${body}`);
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export function listCharacters(): Promise<Character[]> {
  return fetch(`${API_URL}/characters`).then((r) => json<Character[]>(r));
}

export function createCharacter(name: string): Promise<Character> {
  return fetch(`${API_URL}/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then((r) => json<Character>(r));
}

export function getCharacter(id: string): Promise<CharacterDetail> {
  return fetch(`${API_URL}/characters/${id}`).then((r) =>
    json<CharacterDetail>(r),
  );
}

export function requestUploadUrls(
  characterId: string,
  files: Array<{ filename: string; contentType: string; position: number }>,
): Promise<UploadTarget[]> {
  return fetch(`${API_URL}/characters/${characterId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  }).then((r) => json<UploadTarget[]>(r));
}

export async function uploadToPresignedUrl(
  uploadUrl: string,
  fileUri: string,
  contentType: string,
): Promise<void> {
  const blob = await (await fetch(fileUri)).blob();
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }
}

export async function reorderMedia(
  characterId: string,
  order: string[],
): Promise<void> {
  const res = await fetch(`${API_URL}/characters/${characterId}/media-order`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) {
    throw new Error(`Reorder failed: ${res.status}`);
  }
}

export async function deleteCharacter(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/characters/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Delete failed: ${res.status}`);
  }
}

export async function deleteMedia(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/media/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Delete failed: ${res.status}`);
  }
}

export interface SharedLink {
  id: string;
  url: string;
  consumed: boolean;
  createdAt: string;
}

export function pendingSharedLinks(): Promise<SharedLink[]> {
  return fetch(`${API_URL}/shared-links/pending`).then((r) =>
    json<SharedLink[]>(r),
  );
}

export async function consumeSharedLink(id: string): Promise<void> {
  await fetch(`${API_URL}/shared-links/${id}/consume`, { method: "POST" });
}

export function listGenerations(): Promise<Generation[]> {
  return fetch(`${API_URL}/generations`).then((r) => json<Generation[]>(r));
}

export function mediaUrl(path: string): string {
  return `${API_URL}${path}`;
}
