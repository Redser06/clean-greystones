# Shared civic backend

One Firebase project serves Clean Greystones (litter) and the next app, Fix Greystones Roads (potholes). Towns are data, not forks of the client.

## Layout

```
modes/{demo|prod}/towns/{townId}/apps/{litter|roads}/reports/{reportId}
modes/{demo|prod}/towns/{townId}/apps/{litter|roads}/aggregates/{aggregateId}
modes/{demo|prod}/towns/{townId}/apps/{litter|roads}/rateLimits/{uid}
```

Demo and production are separate Firestore roots and separate Hosting targets. Rules reject a write whose `mode`, `appId`, or `townId` does not match the path. Clients do not choose the scope by hostname or by guessing an id prefix.

Photos live at the same scope in Cloud Storage: `modes/{mode}/towns/{townId}/apps/{appId}/reports/{reportId}/{file}`. Rules allow `image/jpeg`, `image/png`, and `image/webp` under 5 MB. `backend/functions/stripExif.ts` is the upload handler: it strips JPEG APP1 and PNG text/EXIF chunks, then the object must be written back with metadata `exifStripped=true` so the trigger does not loop.

## Auth

Residents sign in, including anonymously, and may create reports that pass the schema. They can read their own reports. They cannot read anyone else's, and nothing is publicly readable.

Admin is a custom claim, not a passcode:

```json
{ "admin": { "towns": ["greystones"] } }
```

`backend/claims.ts` decides the claim from the town file's `adminAllowlist`. `backend/scripts/grant-admins.ts` prints that decision. It refuses `--apply`. Set the claim with the Firebase Admin SDK from a trusted machine after Conor fills the allowlist. Rules are what enforce the claim. The client hook `useCivicAuth` exposes `signInWithGoogle`, `signInWithApple`, the current user, and `isAdmin(townId)` for the login card. It does not grant admin by itself.

## Rate limit

Creates are limited to 8 reports per user per app per hour. The limit is in Firestore rules, using `getAfter` on `rateLimits/{uid}` in the same batch as the report. A client-side counter would be optional. A Cloud Function that runs after the write would be too late to refuse it. The rules check is atomic with the create and runs in the emulator with no credentials.

## Client

`src/data/civicBackend.ts` is the typed client the resident data layer calls when `VITE_DEMO` is not exactly `true`. Demo builds keep the synthetic seeds in `src/data/demoSeeds.ts` and `src/utils/demoCohorts.ts` and do not write them to Firestore. Seeded rows carry `is_seeded_demo: true`. `countForEvidence()` counts only real reports from the current device and throws in demo mode.

## Add a town

1. Add `data/towns/<townId>.json`. `townId` matches `id`. Include `firebaseProject`, hosting demo/prod site ids for `clean` and `potholes`, `adminAllowlist`, and the `litter` / `roads` app list.
2. Add the bin file the config names under `data/bins/`.
3. Add Hosting targets in `.firebaserc` and `firebase.json` for that town's sites.
4. `npm test` rejects a config that fails the schema.

## Add an app

Potholes is the next app. It is not in this repository. It should use the same rules, the same `roads` app id, and its own hosting targets (`roads-demo`, `roads-prod`). Do not copy the litter client and do not infer the app from the hostname.

## Local rules

```bash
npm run test:rules
```

That starts the Firestore and Storage emulators only. It does not use a service account.
