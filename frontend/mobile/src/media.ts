import type { Asset } from "react-native-image-picker";

import { requestUploadUrls, uploadToPresignedUrl } from "./api/client";

export interface PositionedAsset {
  asset: Asset;
  position: number;
}

// Registers the assets with the API and PUTs each one to its presigned URL.
export async function uploadAssets(
  characterId: string,
  items: PositionedAsset[],
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const files = items.map(({ asset, position }, i) => ({
    filename: asset.fileName ?? `media-${i}`,
    contentType: asset.type ?? "application/octet-stream",
    position,
  }));
  const targets = await requestUploadUrls(characterId, files);
  await Promise.all(
    targets.map((t, i) =>
      uploadToPresignedUrl(t.uploadUrl, items[i].asset.uri!, files[i].contentType),
    ),
  );
}
