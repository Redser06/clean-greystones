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

export const SAMPLE_EMAIL_RECIPIENT = 'sample@example.invalid';

export interface CouncillorDelivery {
  toEmails: string[];
  ccEmails: string[];
  sample?: 'SAMPLE';
  sendable: boolean;
}

/**
 * Demo mode does not build a sendable email to councillors.
 * The placeholder recipient and SAMPLE stamp are not shown in the preview.
 */
export function deliverCouncillorEmail(
  toEmails: readonly string[],
  ccEmails: readonly string[],
  demo: boolean = isDemo,
): CouncillorDelivery {
  if (!demo) {
    return { toEmails: [...toEmails], ccEmails: [...ccEmails], sendable: true };
  }
  return {
    toEmails: [SAMPLE_EMAIL_RECIPIENT],
    ccEmails: [],
    sample: 'SAMPLE',
    sendable: false,
  };
}
