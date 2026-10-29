#!/usr/bin/env node
/**
 * One-time idempotent migration script for clean_greystones_reports (B1).
 *
 * Converts legacy string-typed `createdAt` fields (e.g. the 14 reports from 22 Oct 2026)
 * into Firestore `Timestamp` values while preserving the original string in
 * `legacyCreatedAtString` for auditability.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/migrate-created-at.mjs --dry-run
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/migrate-created-at.mjs
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const COLLECTION_NAME = 'clean_greystones_reports';
const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  'rapid-prototyping-4134c';

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  });

  const db = getFirestore();
  console.log(
    `[migrate-created-at] Project: ${PROJECT_ID} | Collection: ${COLLECTION_NAME} | Mode: ${
      isDryRun ? 'DRY-RUN (no writes)' : 'LIVE WRITE'
    }`
  );

  const snapshot = await db.collection(COLLECTION_NAME).get();
  console.log(`[migrate-created-at] Scanned ${snapshot.size} total document(s).\n`);

  let migratedCount = 0;
  let skippedTimestampCount = 0;
  let skippedInvalidCount = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const rawCreatedAt = data.createdAt;

    if (
      rawCreatedAt instanceof Timestamp ||
      (rawCreatedAt && typeof rawCreatedAt.toDate === 'function')
    ) {
      const iso = rawCreatedAt.toDate().toISOString();
      console.log(
        `[SKIP] ${docSnap.id}: createdAt is already a Timestamp (${iso})${
          data.legacyCreatedAtString
            ? ` [legacyCreatedAtString="${data.legacyCreatedAtString}"]`
            : ''
        }`
      );
      skippedTimestampCount++;
      continue;
    }

    if (typeof rawCreatedAt !== 'string' || !rawCreatedAt.trim()) {
      console.warn(
        `[WARN] ${docSnap.id}: unexpected createdAt value (${typeof rawCreatedAt}: ${JSON.stringify(
          rawCreatedAt
        )}), skipping.`
      );
      skippedInvalidCount++;
      continue;
    }

    const parsedDate = new Date(rawCreatedAt);
    if (Number.isNaN(parsedDate.getTime())) {
      console.warn(
        `[WARN] ${docSnap.id}: unparseable createdAt string "${rawCreatedAt}", skipping.`
      );
      skippedInvalidCount++;
      continue;
    }

    const newTimestamp = Timestamp.fromDate(parsedDate);
    const legacyCreatedAtString =
      typeof data.legacyCreatedAtString === 'string' && data.legacyCreatedAtString.length > 0
        ? data.legacyCreatedAtString
        : rawCreatedAt;

    console.log(
      `[${isDryRun ? 'DRY-RUN' : 'MIGRATE'}] ${docSnap.id} (confirmations=${
        data.confirmations ?? 1
      }):\n` +
        `  BEFORE: createdAt = ${JSON.stringify(rawCreatedAt)} (string)\n` +
        `  AFTER:  createdAt = Timestamp(${newTimestamp
          .toDate()
          .toISOString()}) | legacyCreatedAtString = ${JSON.stringify(legacyCreatedAtString)}`
    );

    if (!isDryRun) {
      await docSnap.ref.update({
        createdAt: newTimestamp,
        legacyCreatedAtString,
      });
    }

    migratedCount++;
  }

  console.log(
    `\n[migrate-created-at] Summary: ${
      isDryRun ? 'would migrate' : 'migrated'
    }=${migratedCount}, skipped(already Timestamp)=${skippedTimestampCount}, skipped(invalid)=${skippedInvalidCount}`
  );
}

main().catch((err) => {
  console.error('[migrate-created-at] Fatal error:', err);
  process.exit(1);
});
