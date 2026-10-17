# Contributing

All agent work lands through a pull request. Conor approves and merges. Do not push directly to `main`.

Branch protection on `main` has to be turned on by Conor in the GitHub repository settings. This repository cannot switch that on by itself.

## Who owns what

- Frontend work, including the `/admin` Google and Apple login card, belongs to Gemini.
- Backend, town config, security rules, and CI belong to the engineering agents.

Do not deploy from a pull request by hand. Do not deploy to `rapid-prototyping-4134c`. That project is shared. This repo targets placeholder projects `greystones-civic` (prod) and `greystones-civic-demo` (previews). Conor creates those projects, the hosting sites, and the Auth providers. See `backend/README.md`.

Hosting deploys run from `.github/workflows/deploy.yml` only. Production runs from `main` after CI is green on that commit, with `VITE_DEMO` unset, and deploys `hosting:clean-prod` only. That job uses the GitHub Environment `prod` (main only, required reviewer) and reads the prod service account from that environment. Pull-request previews use the separate `FIREBASE_DEMO_SERVICE_ACCOUNT` secret and the demo project. They never reference the prod secret. The preview job skips with a log line when the demo secret is absent. `roads-prod` is not deployed. Organiser emails stay out of the repo; pass them with `ADMIN_EMAILS` when running `backend/scripts/grant-admins.ts`.
