/** Share links (the "Copy link" button) point at a redirector, not the post. */
const SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com", "vt.tiktokv.com"]);
const POST_PATH = /\/(video|photo)\/(\d+)/;
const HANDLE_PATH = /\/@([^/]+)/;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export interface ResolvedPost {
  input: string;
  /** Redirect target with the tracking query string stripped. */
  canonicalUrl: string;
  postId: string;
  handle: string | null;
  kind: "video" | "photo";
  wasShortLink: boolean;
  redirectFollowed: boolean;
}

/**
 * Turns anything the user might paste into a canonical
 * `https://www.tiktok.com/@handle/video/<id>` URL.
 */
export async function resolveTikTokUrl(input: string): Promise<ResolvedPost> {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Not a URL: ${trimmed}`);
  }

  if (!/(^|\.)tiktok(v)?\.com$/.test(url.hostname)) {
    throw new Error(`Not a TikTok URL: ${url.hostname}`);
  }

  const wasShortLink = SHORT_HOSTS.has(url.hostname);
  const needsResolving = wasShortLink || !POST_PATH.test(url.pathname);
  const finalUrl = needsResolving ? new URL(await followRedirects(url.href)) : url;

  const match = POST_PATH.exec(finalUrl.pathname);
  if (!match) {
    throw new Error(
      `Could not find a post id in ${finalUrl.href}. Expected a /video/<id> or /photo/<id> path.`,
    );
  }

  return {
    input: trimmed,
    canonicalUrl: `${finalUrl.origin}${finalUrl.pathname}`.replace(/\/+$/, ""),
    postId: match[2]!,
    handle: HANDLE_PATH.exec(finalUrl.pathname)?.[1] ?? null,
    kind: match[1] as "video" | "photo",
    wasShortLink,
    redirectFollowed: needsResolving,
  };
}

/**
 * TikTok answers HEAD with 403, so this issues a GET and cancels the body as soon
 * as the headers (and therefore the final URL) are in.
 */
async function followRedirects(href: string): Promise<string> {
  const response = await fetch(href, {
    redirect: "follow",
    headers: { "user-agent": BROWSER_UA, "accept-language": "en-US,en;q=0.9" },
  });
  await response.body?.cancel();
  if (!response.ok && response.url === href) {
    throw new Error(`Could not resolve ${href} — TikTok answered HTTP ${response.status}.`);
  }
  return response.url;
}
