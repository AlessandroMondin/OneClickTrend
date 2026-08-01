export type MediaKind = "PHOTO" | "VIDEO";

export interface Character {
  id: string;
  name: string;
  createdAt: string;
  thumbnailUrl?: string | null;
  _count?: { media: number };
}

export interface MediaAsset {
  id: string;
  characterId: string;
  kind: MediaKind;
  s3Key: string;
  mimeType: string;
  createdAt: string;
  url: string;
}

export interface CharacterDetail extends Character {
  media: MediaAsset[];
}

export interface Generation {
  id: string;
  characterId: string | null;
  status: string;
  outputS3Key?: string | null;
  error?: string | null;
  createdAt: string;
  sharedLink?: {
    url: string;
    source: string;
    thumbnailUrl?: string | null;
    title?: string | null;
  } | null;
}

export interface UploadTarget {
  id: string;
  kind: MediaKind;
  uploadUrl: string;
}
