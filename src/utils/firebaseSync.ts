import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { FoulingReport } from '../types';

const firebaseConfig = {
  projectId: 'rapid-prototyping-4134c',
  appId: '1:285060831800:web:39951c8de7a8bb2101a4cd',
  storageBucket: 'rapid-prototyping-4134c.firebasestorage.app',
  apiKey: 'AIzaSyD1h9UGYZuCrptDznp-uC1LPyWvDiscRRg',
  authDomain: 'rapid-prototyping-4134c.firebaseapp.com',
  messagingSenderId: '285060831800',
};

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

const REPORTS_COLLECTION = 'clean_greystones_reports';

/**
 * Real-time listener for crowdsourced communal reports across all residents and browsers.
 * Triggers callback immediately on initial load and whenever any device logs, updates, or deletes a report.
 */
export function subscribeToCrowdsourcedReports(
  onUpdate: (reports: FoulingReport[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, REPORTS_COLLECTION);
  const q = query(colRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const live: FoulingReport[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as FoulingReport;
        live.push({
          ...data,
          id: docSnap.id,
        });
      });
      onUpdate(live);
    },
    (error) => {
      console.warn('Firestore subscription warning, falling back to local storage:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Saves or updates a fouling report in the communal cloud backend.
 */
export async function syncReportToCloud(report: FoulingReport): Promise<void> {
  try {
    const docRef = doc(db, REPORTS_COLLECTION, report.id);
    await setDoc(docRef, report, { merge: true });
  } catch (err) {
    console.error('Failed to sync report to communal cloud:', err);
    throw err;
  }
}

/**
 * Deletes a fouling report from the communal cloud backend (accidental drop or moderation).
 */
export async function deleteReportFromCloud(reportId: string): Promise<void> {
  try {
    const docRef = doc(db, REPORTS_COLLECTION, reportId);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Failed to delete report from communal cloud:', err);
    throw err;
  }
}

/**
 * Increments the confirmation (+1) count for a report in the communal cloud backend.
 */
export async function incrementConfirmationInCloud(
  reportId: string,
  newCount: number
): Promise<void> {
  try {
    const docRef = doc(db, REPORTS_COLLECTION, reportId);
    await updateDoc(docRef, { confirmations: newCount });
  } catch (err) {
    console.error('Failed to increment confirmation in cloud:', err);
    throw err;
  }
}

/**
 * Batch deletes reports from the communal cloud backend (e.g. for complete clean slate reset).
 */
export async function clearReportsFromCloud(reportIds: string[]): Promise<void> {
  if (reportIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    reportIds.forEach((id) => {
      batch.delete(doc(db, REPORTS_COLLECTION, id));
    });
    await batch.commit();
  } catch (err) {
    console.error('Failed to batch delete reports from cloud:', err);
    throw err;
  }
}

/**
 * Batch seeds demo reports to cloud for testing.
 */
export async function seedDemoReportsToCloud(reports: FoulingReport[]): Promise<void> {
  if (reports.length === 0) return;
  try {
    const batch = writeBatch(db);
    reports.forEach((rep) => {
      batch.set(doc(db, REPORTS_COLLECTION, rep.id), rep, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.error('Failed to seed demo reports to cloud:', err);
    throw err;
  }
}
