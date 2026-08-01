import { API_URL } from "../config";
import type {
  Character,
  CharacterDetail,
  Generation,
  UploadTarget,
} from "../types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
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
  files: Array<{ filename: string; contentType: string }>,
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

export function listGenerations(): Promise<Generation[]> {
  return fetch(`${API_URL}/generations`).then((r) => json<Generation[]>(r));
}

export function mediaUrl(path: string): string {
  return `${API_URL}${path}`;
}
