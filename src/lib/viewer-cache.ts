/** Viewer pages use `export const revalidate = 15` (seconds). */
export const VIEWER_REVALIDATE_SECONDS = 15;

/** Client-side polling interval for live dashboard updates (milliseconds). */
export const VIEWER_REFRESH_INTERVAL_MS = VIEWER_REVALIDATE_SECONDS * 1000;

export function snapshotUrlWithCacheBuster(url: string | null, updatedAt: string | null) {
  if (!url) {
    return null;
  }

  if (!updatedAt) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(updatedAt)}`;
}
