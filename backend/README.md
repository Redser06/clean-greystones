# Shared civic backend

**Do not deploy this backend to `rapid-prototyping-4134c`.** That Firebase project is shared with other prototypes. Deploying these Firestore or Storage rules there would replace their rules, and deploying hosting there can overwrite live sites, including `clean-greystones.web.app` and the sister app `greystones-roads.web.app`.

This repo now points at placeholder projects that do not exist until Conor creates them:

- `greystones-civic` is the production project (`firebaseProject` in `data/towns/greystones.json`, `.firebaserc` default).
- `greystones-civic-demo` is the demo and pull-request preview project.

Nothing in this repository deploys those projects. The workflow only deploys hosting, and only after the secrets below exist. It does not deploy rules.

## Manual setup for Conor

1. Create Firebase project `greystones-civic`. Create Firebase project `greystones-civic-demo`. Leave `rapid-prototyping-4134c` untouched.
2. In `greystones-civic`, create the prod hosting site used by the `clean-prod` target (`clean-greystones` only if that site has been moved on purpose). Do not create or deploy the `roads-prod` target. That target is room for the potholes app. Deploying it against the live site `greystones-roads` would overwrite `greystones-roads.web.app`.
3. In `greystones-civic-demo`, create the demo hosting site for the `clean-demo` target (`clean-greystones-demo`). `roads-demo` is room only.
4. Enable Auth providers on `greystones-civic`: Google, Apple, and Anonymous. Enable the same providers on the demo project if previews need sign-in.
5. In GitHub, create an Environment named `prod`. Limit deployment branches to `main`. Add a required reviewer. Store the `greystones-civic` service account as the environment secret `FIREBASE_SERVICE_ACCOUNT`. Do not also create a repository secret with that name. Environment secrets are not available to pull-request jobs, and the pull-request job does not reference that secret.
6. Store a separate `greystones-civic-demo` service account as the repository secret `FIREBASE_DEMO_SERVICE_ACCOUNT`. That account must not be able to deploy production or replace rules.
7. Optional: set repository variables (Settings → Secrets and variables → Actions → Variables) `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID` from the `greystones-civic` web app config. The prod build reads `vars.*`. Empty values are fine; the client no-ops. These are not secrets.
8. Turn on branch protection for `main`. Agents open pull requests. Conor approves and merges.

Production hosting deploys from `main` only after CI is green on that commit, with `VITE_DEMO` unset, to `hosting:clean-prod` on `greystones-civic`. Pull-request previews deploy only to `clean-demo` on `greystones-civic-demo`, and they skip with a log line when the demo secret is absent.

## Layout

```
modes/{demo|prod}/towns/{townId}/apps/{litter|roads}/reports/{reportId}
modes/{demo|prod}/towns/{townId}/apps/{litter|roads}/aggregates/{aggregateId}
modes/{demo|prod}/towns/{townId}/apps/{litter|roads}/rateLimits/{uid}
```

Demo and production are separate Firestore roots and separate Hosting targets. Clients cannot write under `modes/demo`. Production writes must match the path, an allowlisted town id (`greystones` until another town is added to the rules), and the app id `litter` or `roads`. Clients do not choose the scope by hostname.

Photos live at `modes/{mode}/towns/{townId}/apps/{appId}/reports/{reportId}/photo`. The file name must be `photo`. Rules allow `image/jpeg`, `image/png`, and `image/webp` under 5 MB, and only when that report exists and `authorUid` is the uploader. `backend/functions/stripExif.ts` is the upload handler: it strips JPEG APP1 and PNG text/EXIF chunks, then the object must be written back with metadata `exifStripped=true` so the trigger does not loop. The function is not deployed from this repo.

## Auth

Residents sign in, including anonymously, and may create reports that pass the schema. They can read their own reports. They cannot read anyone else's, and nothing is publicly readable.

Admin is a custom claim, not a passcode:

```json
{ "admin": { "towns": ["greystones"] } }
```

`backend/claims.ts` decides the claim. The public town file keeps `adminAllowlist` empty. Pass the organiser addresses only at runtime, with `ADMIN_EMAILS` or `--emails`. Do not commit them.

For Greystones, from the repo root, on a trusted machine:

```bash
ADMIN_EMAILS='organiser-one@example.com,organiser-two@example.com' node --import tsx backend/scripts/grant-admins.ts --town greystones
```

Replace the example addresses with the real organiser addresses in the shell. The script prints the claim plan and refuses `--apply`. Set the claim with the Firebase Admin SDK from that machine after the plan looks right. Rules enforce the claim. The client hook `useCivicAuth` exposes `signInWithGoogle`, `signInWithApple`, the current user, and `isAdmin(townId)` for the login card. It does not grant admin by itself.

## Rate limit

Creates are limited to 8 reports per user per app per hour. The limit is in Firestore rules, in the same batch as the report.

- A new `rateLimits/{uid}` document is allowed only with `count == 1`, `windowStart == request.time`, and `lastReportId` set to the report created in that same batch.
- An update may only add 1 to `count` while keeping the same `windowStart`, and `count` cannot pass 8. `lastReportId` must be the one report in the batch. `existsAfter` requires that report.
- A report create is allowed only when `getAfter` on the rate doc has `lastReportId` equal to that report. One step cannot carry a second report.
- A reset (`count == 1` and a new `windowStart == request.time`) is allowed only once `request.time` is at least one hour past the stored `windowStart`.

A client cannot clear the window by writing a fresh timestamp. A client-side counter is optional. A Cloud Function that runs after the write would be too late to refuse it. The rules check runs in the emulator with no credentials.

## Client

`src/data/civicBackend.ts` is the typed client the resident data layer calls when demo mode is off. The Firebase SDK is loaded with dynamic `import()` so it is not part of the main App chunk. Demo builds keep the synthetic seeds in `src/data/demoSeeds.ts` and `src/utils/demoCohorts.ts` and do not write them to Firestore. Seeded rows carry `is_seeded_demo: true`. `countForEvidence()` counts only real reports from the current device and throws in demo mode. `deliverCouncillorEmail()` refuses a sendable councillor email in demo: it returns a placeholder recipient. `mailtoSample()` puts `SAMPLE` on the mailto and Gmail subject and body only. The on-screen preview still renders the unstamped subject and body.

## Add a town

1. Add `data/towns/<townId>.json`. `townId` matches `id`. Include `firebaseProject`, hosting demo/prod site ids for `clean` and `potholes`, an empty `adminAllowlist`, and the `litter` / `roads` app list.
2. Add the town id to `isKnownTown` in `backend/firestore.rules` and `backend/storage.rules`.
3. Add the bin file the config names under `data/bins/`.
4. Add Hosting targets in `.firebaserc` and `firebase.json` for that town's sites.
5. `npm test` rejects a config that fails the schema.

## Add an app

Potholes is the next app. It is not in this repository. It should use the same rules, the same `roads` app id, and its own hosting targets (`roads-demo`, `roads-prod`). Those targets are documented room only. Do not deploy `roads-prod`. Do not copy the litter client and do not infer the app from the hostname. This client reads the `clean` app from the town config.

## Local rules

```bash
npm run test:rules
```

That starts the Firestore and Storage emulators only. It does not use a service account.
