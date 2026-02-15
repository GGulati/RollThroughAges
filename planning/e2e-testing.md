# E2E Testing Runbook

## Scope
Use this runbook for browser-level verification of the app (real browser, no mocked reducer/store path).

## Prerequisites
- Install dependencies: `npm install`
- Ensure Node/npm are available: `node --version`, `npm --version`
- Ensure `npx` works: `npx --version`

## Start App
Run from repo root:

```powershell
npm run dev -- --host 127.0.0.1 --port 4173
```

App URL:
- `http://127.0.0.1:4173`

## Playwright CLI Browser Checks
Use Playwright CLI through `npx` (no repo-level Playwright test project required).

Open browser (headed):

```powershell
cmd /c npx --yes --package @playwright/cli playwright-cli open http://127.0.0.1:4173 --headed
```

Capture snapshot and console:

```powershell
cmd /c npx --yes --package @playwright/cli playwright-cli snapshot
cmd /c npx --yes --package @playwright/cli playwright-cli console
```

Desktop screenshot:

```powershell
cmd /c npx --yes --package @playwright/cli playwright-cli resize 1440 900
cmd /c npx --yes --package @playwright/cli playwright-cli screenshot
```

Mobile screenshot:

```powershell
cmd /c npx --yes --package @playwright/cli playwright-cli resize 390 844
cmd /c npx --yes --package @playwright/cli playwright-cli screenshot
```

Close session:

```powershell
cmd /c npx --yes --package @playwright/cli playwright-cli close-all
```

## Artifacts
- Raw CLI artifacts are written to `.playwright-cli/`.
- Copy final evidence to `output/playwright/` with stable names:
  - `stage2-e2e-desktop.png`
  - `stage2-e2e-mobile.png`
  - `stage2-e2e-snapshot.yml`
  - `stage2-e2e-console.log`

## Stage Gate Expectation (Stage 2+)
For each stage gate and major UI slice:
- verify app boots in browser
- verify core user flow for that slice using real Redux state
- capture desktop + mobile screenshot
- capture snapshot + console log
- keep `npm test -- --run`, `npm run lint:strict`, and `npm run typecheck` green
