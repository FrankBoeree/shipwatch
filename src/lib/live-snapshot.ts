/** Capture uploads a snapshot about every 10 seconds while the camera is active. */
export const LIVE_SNAPSHOT_MAX_AGE_MS = 45_000;

export function isSnapshotLive(updatedAt: string | null, now = Date.now()) {
  if (!updatedAt) {
    return false;
  }

  const ageMs = now - new Date(updatedAt).getTime();
  return ageMs >= 0 && ageMs <= LIVE_SNAPSHOT_MAX_AGE_MS;
}
