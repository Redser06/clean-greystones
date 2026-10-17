import type { Report } from '../types';
import { isReport } from './reportFlow';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStoredReports(store: KeyValueStore, storageKey: string): Report[] | null {
  const raw = store.getItem(storageKey);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isReport);
  } catch {
    return null;
  }
}

export function writeStoredReports(store: KeyValueStore, reports: Report[], storageKey: string): void {
  store.setItem(storageKey, JSON.stringify(reports));
}
