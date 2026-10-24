import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  writeBatch,
  getDocs,
  Unsubscribe,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  getIdTokenResult,
} from 'firebase/auth';
import { CivicActionEvent, DailyFoulingSnapshot, FoulingReport, PublicBin } from '../types';

const env =
  (typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env?: Record<string, string> }).env
    : undefined) ||
  (typeof process !== 'undefined'
    ? (process.env as Record<string, string>)
    : undefined);

const firebaseConfig = {
  projectId: env?.VITE_FIREBASE_PROJECT_ID || 'rapid-prototyping-4134c',
  appId: env?.VITE_FIREBASE_APP_ID || '',
  storageBucket: env?.VITE_FIREBASE_STORAGE_BUCKET || 'rapid-prototyping-4134c.firebasestorage.app',
  apiKey: env?.VITE_FIREBASE_API_KEY || '',
  authDomain: env?.VITE_FIREBASE_AUTH_DOMAIN || 'rapid-prototyping-4134c.firebaseapp.com',
  messagingSenderId: env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '285060831800',
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Initialize Firebase App singleton only when configured
const app = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;

/**
 * Verifies if a user possesses the administrator role.
 * Evaluates custom JWT claims ('admin' / 'role === admin'), configured admin emails,
 * and the Firestore admin_roles collection.
 */
export async function verifyUserAdminRole(user: User | null | undefined): Promise<boolean> {
  if (!user) return false;
  try {
    // 1. Check custom claims in JWT
    let claims: Record<string, unknown> | undefined;
    if (typeof (user as any).getIdTokenResult === 'function') {
      const tokenResult = await (user as any).getIdTokenResult();
      claims = tokenResult?.claims;
    } else {
      const tokenResult = await getIdTokenResult(user);
      claims = tokenResult?.claims;
    }

    if (claims?.admin === true || claims?.role === 'admin') {
      return true;
    }

    // 2. Check user email against configured admin emails
    const adminEmailsEnv =
      (typeof import.meta !== 'undefined'
        ? (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ADMIN_EMAILS
        : undefined) ||
      (typeof process !== 'undefined' ? process.env?.VITE_ADMIN_EMAILS : undefined) ||
      'admin@cleangreystones.ie';

    const allowedEmails = adminEmailsEnv
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (user.email && allowedEmails.includes(user.email.toLowerCase())) {
      return true;
    }

    // 3. Fallback check: admin_roles collection document in Firestore
    if (db) {
      const adminDoc = await getDoc(doc(db, 'admin_roles', user.uid));
      if (adminDoc.exists() && adminDoc.data()?.role === 'admin') {
        return true;
      }
    }

    return false;
  } catch (err) {
    console.warn('Error verifying admin role:', err);
    return false;
  }
}

/**
 * Signs in an administrator using Firebase Authentication with Email & Password.
 */
export async function signInAdminWithFirebase(
  email: string,
  passcode: string
): Promise<User> {
  if (!auth) {
    throw new Error('Firebase Authentication is not configured');
  }
  const cred = await signInWithEmailAndPassword(auth, email.trim(), passcode);
  const isAdmin = await verifyUserAdminRole(cred.user);
  if (!isAdmin) {
    await signOut(auth);
    throw new Error('Access denied: Account does not possess an active administrator role');
  }
  return cred.user;
}

/**
 * Signs out the currently authenticated Firebase user.
 */
export async function signOutAdminFromFirebase(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

/**
 * Listens for Firebase Auth state changes and verifies whether the current user has the admin role.
 */
export function subscribeToAdminAuth(
  callback: (user: User | null, isAdmin: boolean) => void
): () => void {
  if (!auth) {
    callback(null, false);
    return () => {};
  }
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null, false);
      return;
    }
    const isAdmin = await verifyUserAdminRole(user);
    callback(user, isAdmin);
  });
}

const REPORTS_COLLECTION = 'clean_greystones_reports';

const VALID_SEVERITIES = new Set([
  'just_poop',
  'stepped_in',
  'buggy_wheels',
  'wheelchair_wheels',
]);

/**
 * Runtime schema & bounds validator for crowdsourced reports from Firestore or localStorage.
 * Prevents malformed or poisoned documents from crashing React render paths.
 */
export function isValidCrowdsourcedReport(raw: unknown): raw is FoulingReport {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  if (typeof r.createdAt !== 'string' || r.createdAt.length < 10) return false;
  if (typeof r.lat !== 'number' || !Number.isFinite(r.lat) || r.lat < 53.05 || r.lat > 53.22) {
    return false;
  }
  if (typeof r.lng !== 'number' || !Number.isFinite(r.lng) || r.lng < -6.20 || r.lng > -6.00) {
    return false;
  }
  if (typeof r.streetName !== 'string' || !r.streetName.trim()) return false;
  if (typeof r.areaName !== 'string' || !r.areaName.trim()) return false;
  if (typeof r.severity !== 'string' || !VALID_SEVERITIES.has(r.severity)) return false;
  if (typeof r.confirmations !== 'number' || !Number.isFinite(r.confirmations) || r.confirmations < 1) {
    return false;
  }
  if (typeof r.submitterToken !== 'string' || !r.submitterToken.trim()) return false;
  if (typeof r.dBinAllM !== 'number' || !Number.isFinite(r.dBinAllM) || r.dBinAllM < 0) {
    return false;
  }
  return true;
}

/**
 * Real-time listener for crowdsourced communal reports across all residents and browsers.
 * Triggers callback immediately on initial load and whenever any device logs, updates, or deletes a report.
 */
export function subscribeToCrowdsourcedReports(
  onUpdate: (reports: FoulingReport[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) {
    if (onError) onError(new Error('Firebase is not configured'));
    return () => {};
  }

  const colRef = collection(db, REPORTS_COLLECTION);
  const q = query(colRef, orderBy('createdAt', 'desc'), limit(500));

  return onSnapshot(
    q,
    (snapshot) => {
      const live: FoulingReport[] = [];
      snapshot.forEach((docSnap) => {
        const raw = { ...docSnap.data(), id: docSnap.id };
        if (isValidCrowdsourcedReport(raw) && raw.status !== 'deleted') {
          live.push(raw);
        }
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
 * Saves a newly created fouling report in the communal cloud backend.
 */
export async function syncReportToCloud(report: FoulingReport): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, REPORTS_COLLECTION, report.id);
    await setDoc(docRef, report, { merge: true });
  } catch (err) {
    console.error('Failed to sync report to communal cloud:', err);
    throw err;
  }
}

/**
 * Updates only the optional post-log details (note / compressed photo) on a newly created report.
 */
export async function updateReportOptionalDetailsInCloud(
  reportId: string,
  details: { note?: string; hasPhoto?: boolean; photoDataUrl?: string }
): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, REPORTS_COLLECTION, reportId);
    const payload: Record<string, unknown> = {};
    if (details.note !== undefined) payload.note = details.note;
    if (details.hasPhoto !== undefined) payload.hasPhoto = details.hasPhoto;
    if (details.photoDataUrl !== undefined) payload.photoDataUrl = details.photoDataUrl;
    if (Object.keys(payload).length > 0) {
      await updateDoc(docRef, payload);
    }
  } catch (err) {
    console.error('Failed to update optional report details in cloud:', err);
    throw err;
  }
}

/**
 * Deletes a fouling report from the communal cloud backend.
 * If signed in as an administrator, performs a hard delete in Firestore.
 * If unauthenticated or a resident removing an accidental submission, applies a soft-delete status.
 */
export async function deleteReportFromCloud(reportId: string): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, REPORTS_COLLECTION, reportId);
    const currentUser = auth?.currentUser;
    const isAdmin = await verifyUserAdminRole(currentUser);
    if (isAdmin) {
      await deleteDoc(docRef);
    } else {
      await updateDoc(docRef, {
        status: 'deleted',
        deletedAt: new Date().toISOString(),
      });
    }
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
  if (!db) return;
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
  if (!db || reportIds.length === 0) return;
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
  if (!db || reports.length === 0) return;
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

const SNAPSHOTS_COLLECTION = 'clean_greystones_snapshots';

/**
 * Saves a daily 24-hour summary snapshot in Cloud Firestore.
 */
export async function saveDailySnapshotToCloud(
  snapshot: DailyFoulingSnapshot
): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, SNAPSHOTS_COLLECTION, snapshot.date);
    await setDoc(docRef, snapshot, { merge: true });
  } catch (err) {
    console.error('Failed to save daily snapshot to cloud:', err);
  }
}

/**
 * Fetches historical daily snapshots from Cloud Firestore.
 */
export async function fetchSnapshotsFromCloud(): Promise<DailyFoulingSnapshot[]> {
  if (!db) return [];
  try {
    const colRef = collection(db, SNAPSHOTS_COLLECTION);
    const q = query(colRef, orderBy('date', 'desc'));
    const snap = await getDocs(q);
    const list: DailyFoulingSnapshot[] = [];
    snap.forEach((d) => {
      list.push(d.data() as DailyFoulingSnapshot);
    });
    return list;
  } catch (err) {
    console.warn('Could not fetch daily snapshots from cloud:', err);
    return [];
  }
}

/**
 * One-shot fetch of latest communal reports from Cloud Firestore
 * (used to ensure councillor emails contain the freshest backend evidence).
 */
export async function fetchLiveReportsFromCloud(): Promise<FoulingReport[]> {
  if (!db) return [];
  try {
    const colRef = collection(db, REPORTS_COLLECTION);
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(500));
    const snap = await getDocs(q);
    const live: FoulingReport[] = [];
    snap.forEach((d) => {
      const raw = { ...d.data(), id: d.id };
      if (isValidCrowdsourcedReport(raw) && raw.status !== 'deleted') {
        live.push(raw);
      }
    });
    return live;
  } catch (err) {
    console.warn('Failed to fetch live reports from cloud:', err);
    return [];
  }
}

/**
 * Updates an existing primary report when a nearby observation (<=15m) is merged into it.
 * Only modifies the fields permitted by Firestore corroboration security rules.
 */
export async function mergeReportInCloud(
  primaryReport: FoulingReport
): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, REPORTS_COLLECTION, primaryReport.id);
    const payload: Record<string, unknown> = {
      confirmations: primaryReport.confirmations,
      severity: primaryReport.severity,
      lastConfirmedAt: primaryReport.lastConfirmedAt ?? new Date().toISOString(),
      additionalSubmitters: primaryReport.additionalSubmitters ?? [],
    };
    if (primaryReport.note !== undefined) {
      payload.note = primaryReport.note;
    }
    await updateDoc(docRef, payload);
  } catch (err) {
    console.error('Failed to merge report in cloud:', err);
    throw err;
  }
}

const EVENTS_COLLECTION = 'clean_greystones_events';

/**
 * Logs an anonymous product analytics event (e.g. council email action, drop logged, corroboration).
 */
export async function logCivicEventToCloud(event: CivicActionEvent): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, EVENTS_COLLECTION, event.id);
    await setDoc(docRef, event, { merge: true });
  } catch (err) {
    console.error('Failed to log civic event to cloud:', err);
  }
}

/**
 * Real-time listener for civic product events (emails sent, button clicks, drops).
 */
export function subscribeToCivicEvents(
  onUpdate: (events: CivicActionEvent[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) {
    if (onError) onError(new Error('Firebase is not configured'));
    return () => {};
  }

  const colRef = collection(db, EVENTS_COLLECTION);
  const q = query(colRef, orderBy('timestamp', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: CivicActionEvent[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...(docSnap.data() as CivicActionEvent), id: docSnap.id });
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('Events subscription error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * One-shot fetch of all civic events from Cloud Firestore.
 */
export async function fetchCivicEventsFromCloud(): Promise<CivicActionEvent[]> {
  if (!db) return [];
  try {
    const colRef = collection(db, EVENTS_COLLECTION);
    const q = query(colRef, orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    const list: CivicActionEvent[] = [];
    snap.forEach((d) => {
      list.push({ ...(d.data() as CivicActionEvent), id: d.id });
    });
    return list;
  } catch (err) {
    console.warn('Failed to fetch events from cloud:', err);
    return [];
  }
}

/**
 * Completely clears all live reports from Cloud Firestore (admin backend data wipe).
 * Requires verified Firebase administrator authentication.
 */
export async function clearAllLiveReportsFromCloud(): Promise<number> {
  const currentUser = auth?.currentUser;
  const isAdmin = await verifyUserAdminRole(currentUser);
  if (!isAdmin) {
    throw new Error(
      'Unauthorized: An authenticated administrator with an admin role is required to clear cloud data.'
    );
  }
  if (!db) return 0;
  try {
    const colRef = collection(db, REPORTS_COLLECTION);
    const snap = await getDocs(colRef);
    if (snap.empty) return 0;

    const batch = writeBatch(db);
    let count = 0;
    snap.forEach((d) => {
      batch.delete(d.ref);
      count++;
    });
    await batch.commit();
    return count;
  } catch (err) {
    console.error('Failed to clear live reports from cloud:', err);
    throw err;
  }
}

/**
 * Completely clears all civic analytics events from Cloud Firestore.
 * Requires verified Firebase administrator authentication.
 */
export async function clearAllCivicEventsFromCloud(): Promise<number> {
  const currentUser = auth?.currentUser;
  const isAdmin = await verifyUserAdminRole(currentUser);
  if (!isAdmin) {
    throw new Error(
      'Unauthorized: An authenticated administrator with an admin role is required to clear cloud data.'
    );
  }
  if (!db) return 0;
  try {
    const colRef = collection(db, EVENTS_COLLECTION);
    const snap = await getDocs(colRef);
    if (snap.empty) return 0;

    const batch = writeBatch(db);
    let count = 0;
    snap.forEach((d) => {
      batch.delete(d.ref);
      count++;
    });
    await batch.commit();
    return count;
  } catch (err) {
    console.error('Failed to clear events from cloud:', err);
    throw err;
  }
}

const BINS_COLLECTION = 'clean_greystones_bins';

/**
 * Real-time listener for verified public bins in Cloud Firestore.
 */
export function subscribeToCrowdsourcedBins(
  onUpdate: (bins: PublicBin[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) {
    if (onError) onError(new Error('Firebase is not configured'));
    return () => {};
  }

  const colRef = collection(db, BINS_COLLECTION);
  const q = query(colRef, orderBy('code', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: PublicBin[] = [];
      snapshot.forEach((docSnap) => {
        list.push({
          ...(docSnap.data() as PublicBin),
          id: docSnap.id,
        });
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('Bins subscription warning:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Saves or updates a public bin in the cloud backend (e.g. manually logged by administrator).
 */
export async function syncBinToCloud(bin: PublicBin): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, BINS_COLLECTION, bin.id);
    await setDoc(docRef, bin, { merge: true });
  } catch (err) {
    console.error('Failed to sync bin to cloud:', err);
    throw err;
  }
}

/**
 * Deletes a public bin from the cloud backend.
 */
export async function deleteBinFromCloud(binId: string): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, BINS_COLLECTION, binId);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Failed to delete bin from cloud:', err);
    throw err;
  }
}

/**
 * One-shot fetch of all registered bins from Cloud Firestore.
 */
export async function fetchBinsFromCloud(): Promise<PublicBin[]> {
  if (!db) return [];
  try {
    const colRef = collection(db, BINS_COLLECTION);
    const q = query(colRef, orderBy('code', 'asc'));
    const snap = await getDocs(q);
    const list: PublicBin[] = [];
    snap.forEach((d) => {
      list.push({ ...(d.data() as PublicBin), id: d.id });
    });
    return list;
  } catch (err) {
    console.warn('Failed to fetch bins from cloud:', err);
    return [];
  }
}

