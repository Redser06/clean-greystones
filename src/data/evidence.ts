import { isDemo } from '../config/mode';
import type { FoulingReport } from '../types';

type EvidenceRow = Pick<FoulingReport, 'submitterToken' | 'isSeededDemo' | 'is_seeded_demo'>;

/**
 * Count of real reports from this device only.
 * Demo mode throws so seeded rows can never be presented as evidence.
 */
export function countForEvidence(reports: readonly EvidenceRow[], ownToken: string, demo: boolean = isDemo): number {
  if (demo) {
    throw new Error('countForEvidence is unavailable in demo mode');
  }
  return reports.filter((report) => {
    if (report.submitterToken !== ownToken) return false;
    if (report.isSeededDemo === true || report.is_seeded_demo === true) return false;
    return true;
  }).length;
}
