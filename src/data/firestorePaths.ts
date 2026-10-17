export type CivicMode = 'demo' | 'prod';
export type CivicAppId = 'litter' | 'roads';

export const REPORT_RATE_LIMIT = 8;
export const REPORT_RATE_WINDOW_MS = 60 * 60 * 1000;

export function reportCollectionPath(mode: CivicMode, townId: string, appId: CivicAppId): string {
  return `modes/${mode}/towns/${townId}/apps/${appId}/reports`;
}

export function reportDocPath(
  mode: CivicMode,
  townId: string,
  appId: CivicAppId,
  reportId: string,
): string {
  return `${reportCollectionPath(mode, townId, appId)}/${reportId}`;
}

export function rateLimitDocPath(mode: CivicMode, townId: string, appId: CivicAppId, uid: string): string {
  return `modes/${mode}/towns/${townId}/apps/${appId}/rateLimits/${uid}`;
}

export function aggregateDocPath(
  mode: CivicMode,
  townId: string,
  appId: CivicAppId,
  aggregateId: string,
): string {
  return `modes/${mode}/towns/${townId}/apps/${appId}/aggregates/${aggregateId}`;
}

export function photoStoragePath(
  mode: CivicMode,
  townId: string,
  appId: CivicAppId,
  reportId: string,
  fileName: string,
): string {
  return `modes/${mode}/towns/${townId}/apps/${appId}/reports/${reportId}/${fileName}`;
}

export function nextRateWindow(input: {
  nowMs: number;
  previous: { count: number; windowStartMs: number } | null;
  limit?: number;
  windowMs?: number;
}): { count: number; windowStartMs: number } | { limited: true } {
  const limit = input.limit ?? REPORT_RATE_LIMIT;
  const windowMs = input.windowMs ?? REPORT_RATE_WINDOW_MS;
  if (!input.previous || input.nowMs - input.previous.windowStartMs >= windowMs) {
    return { count: 1, windowStartMs: input.nowMs };
  }
  if (input.previous.count >= limit) return { limited: true };
  return { count: input.previous.count + 1, windowStartMs: input.previous.windowStartMs };
}
