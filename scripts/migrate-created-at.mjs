#!/usr/bin/env node
/**
 * One-time idempotent migration script for clean_greystones_reports (B1).
 *
 * Converts legacy string-typed `createdAt` fields (e.g. the 14 reports from 22 Oct 2026)
 * into Firestore `Timestamp` values while preserving the original string in
 * `legacyCreatedAtString` for auditability.
 *
 * Defaults to DRY-RUN mode (no writes). Pass `--apply` to execute writes.
 * Requires explicit target project via `--project <id>` (or `FIREBASE_PROJECT_ID` / `GCLOUD_PROJECT`).
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/migrate-created-at.mjs --project rapid-prototyping-4134c
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/migrate-created-at.mjs --project rapid-prototyping-4134c --apply
 */

import { pathToFileURL } from 'node:url';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const COLLECTION_NAME = 'clean_greystones_reports';

export function parseMigrationArgs(argv = process.argv.slice(2), env = process.env) {
  let applyFlag = false;
  let dryRunFlag = false;
  let cliProjectId = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') {
      applyFlag = true;
    } else if (arg === '--dry-run') {
      dryRunFlag = true;
    } else if (arg === '--project') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        throw new Error('Missing value for --project <projectId>.');
      }
      cliProjectId = next.trim();
      i++;
    } else if (arg.startsWith('--project=')) {
      const val = arg.slice('--project='.length).trim();
      if (!val) {
        throw new Error('Missing value for --project=<projectId>.');
      }
      cliProjectId = val;
    } else {
      throw new Error(
        `Unknown argument "${arg}". Allowed flags: --dry-run (default), --apply, --project <projectId>.`
      );
    }
  }

  if (applyFlag && dryRunFlag) {
    throw new Error('Cannot pass both --apply and --dry-run.');
  }

  const projectId = (cliProjectId || env.FIREBASE_PROJECT_ID || env.GCLOUD_PROJECT || '').trim();
  if (!projectId) {
    throw new Error(
      'Target Firebase project is required explicitly. Pass --project <projectId> or set FIREBASE_PROJECT_ID.'
    );
  }

  const isApply = applyFlag;
  const isDryRun = !isApply;

  return {
    projectId,
    isApply,
    isDryRun,
  };
}

async function main() {
  let parsed;
  try {
    parsed = parseMigrationArgs();
  } catch (err) {
    console.error(`[migrate-created-at] Argument error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const { projectId, isDryRun } = parsed;

  console.log(`[migrate-created-at] Target project: ${projectId}`);
  console.log(
    `[migrate-created-at] Project: ${projectId} | Collection: ${COLLECTION_NAME} | Mode: ${
      isDryRun ? 'DRY-RUN (default, no writes — pass --apply to write)' : 'LIVE WRITE (--apply)'
    }`
  );

  initializeApp({
    credential: applicationDefault(),
    projectId,
  });

  const db = getFirestore();

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

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((err) => {
    console.error('[migrate-created-at] Fatal error:', err);
    process.exit(1);
  });
}
