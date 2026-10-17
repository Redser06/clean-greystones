import type { Report } from '../types';
import { isReport } from './reportFlow';

export const REPORTS_STORAGE_KEY = 'clean-greystones.reports.v1';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStoredReports(store: KeyValueStore): Report[] | null {
  const raw = store.getItem(REPORTS_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isReport);
  } catch {
    return null;
  }
}

export function writeStoredReports(store: KeyValueStore, reports: Report[]): void {
  store.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports));
}
