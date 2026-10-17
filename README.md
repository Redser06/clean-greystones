# Clean Greystones

A small civic app for Greystones, Co. Wicklow. Residents can report dog fouling, see how many reports were logged this month, and write to their councillors.

The app does not send email. It opens the resident's own mail app, or copies the message.

## Resident jobs

1. **Report.** A full-screen map and one button, Report this spot. The pin drops at the current location and can be dragged. A photo and an impact chip are optional.
2. **Picture.** One figure: reports this month, and how that compares with last month, on a cluster map.
3. **Act.** Tell your councillors opens a short note with three polite tones. The six Greystones Municipal District councillors are selected already.

Bin markers, bin voting and the long stats pages are not in the resident app. Distance to litter bins is calculated in `src/lib/binDistance.ts` and shown only at `/admin`, which the resident screens do not link to.

## Map tiles

Set `VITE_GOOGLE_MAPS_API_KEY` at build time if you want Google Streets. Vite reads it from `.env` (see `.env.example`). Do not commit a key. If the variable is missing, or Google rejects it, the map uses OpenStreetMap.

`VITE_DEMO_DATA=true` shows a few sample locations for local demos. Leave it unset for production. Sample data has no quotes or invented totals.

## Law

The offence cited in the email is section 22 of the Litter Pollution Act 1997. The fixed penalty is described as something that may result, without treating a euro amount as a verified dog-fouling fine. The September 2026 Department notice on section 36 of the Circular Economy and Miscellaneous Provisions Act 2022 is about littering fixed payments generally, and the admin export says so.

## Scripts

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

## Hosting

Firebase Hosting for project `rapid-prototyping-4134c` serves the `dist` folder (`firebase.json`). This repository does not contain a workflow that deploys a live or preview channel. Pull requests run `.github/workflows/ci.yml` only: lint, typecheck, test and build.
