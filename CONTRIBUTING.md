# Contributing

All agent work lands through a pull request. Conor approves and merges. Do not push directly to `main`.

Branch protection on `main` has to be turned on by Conor in the GitHub repository settings. This repository cannot switch that on by itself.

## Who owns what

- Frontend work, including the `/admin` Google and Apple login card, belongs to Gemini.
- Backend, town config, security rules, and CI belong to the engineering agents.

Do not deploy from a pull request by hand. Hosting deploys run from `.github/workflows/deploy.yml` only: production from `main` after CI is green on that commit and with `VITE_DEMO` unset, and pull-request previews only on the demo hosting target. The workflow skips with a log line when `FIREBASE_SERVICE_ACCOUNT` is not set.
