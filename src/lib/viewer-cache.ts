/** Viewer pages use `export const revalidate = 15` (seconds). */

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
