# Cartup Content — Work Performance Dashboard

An internal dashboard for the Cartup Content Department. It reads the live **Google Sheet** (Work Sheet, KPI & Target, and an optional Target tab) and publishes a fast, static dashboard on **GitHub Pages**.

```
Google Sheet ──► Google Sheets API ──► GitHub Action (every 5 min) ──► data.json ──► GitHub Pages ──► Browsers
                     (service account,                   (built into the site;
                      GitHub secret only)                 never committed to git)
```

- **No credentials in the browser.** Only the GitHub Action talks to Google, using a key stored as a GitHub secret. The website only reads the generated `data/data.json`.
- **Low Google API quota use.** Each sync makes 1 token request, 1 metadata request and 2 batched value reads, no matter how many rows or viewers there are.
- **No invented numbers.** If a column is missing or a value can't be calculated, the dashboard shows **N/A**.

---

## Features

| Area | What you get |
|---|---|
| Dashboard | 8 KPI cards (Total Work, Completed, Pending, Total SKU, Uploaded SKU, QC Approved, QC Rejected, KPI Achievement %), Target vs Achievement, Work Status, Task Type, Monthly Trend, Upload/QC/Visual summaries, AI vs Manual, Team Performance, and the filtered work table |
| Work Sheet | Paginated table (25–200 rows/page), sorting, column picker, horizontal scroll, row detail drawer, CSV and Excel export |
| KPI & Target | Every team table from the KPI & Target tab with Target, Actual, Achievement % (Actual ÷ Target × 100), Gap (Actual − Target) and progress bars; a "Sheet table" view shows every column |
| Team Performance | Pick any person to see their jobs, SKU, uploads, QC, image work, AI/manual editing and their KPI rows, whatever roles they appear in |
| Upload / QC / Visual | Daily/weekly/monthly trends, per-person bars, status breakdowns, SLA labels, median turnaround |
| Reports | **Individual Summary report** (weekly / monthly / yearly, vs previous period or same period last year, pick teams & people, one-click PDF/Excel), Monthly Performance, data exports |
| Team Members | Full names for reports, team assignment, **mark who left the job** (with last working day) |
| Settings | Auto-refresh interval, theme, data-source details, data-health warnings, mapping overview |
| Interaction | Global filters (date preset/custom, month, vertical, task type, status, employee, uploaded by, QC by, visual editor, shop name, L1 category), debounced global search, click-to-filter charts, click-to-drill KPI cards, Reset |
| Quality | TypeScript, error boundaries, loading/empty/error states, responsive (sidebar → icon rail → bottom nav), light and dark themes |

---

## Setup

### STEP 1 — Create the GitHub repository
Create a repository on GitHub (e.g. `cartup-work-tracker`). **Public** repositories get unlimited free Actions minutes; see [Costs & schedule](#costs--schedule) for private ones.

### STEP 2 — Add the project files
Push this project to the repository's default branch (`main`).

```bash
git clone https://github.com/<you>/cartup-work-tracker.git
cd cartup-work-tracker
# copy the project files in, then:
git add . && git commit -m "Cartup Content dashboard" && git push origin main
```

### STEP 3 — Create GitHub Secrets
In the repository go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The **entire contents** of the service-account key file (`{ "type": "service_account", ... }`). Base64 of the file also works. |
| `GOOGLE_SHEET_ID` | `1H35eZz06Wx4uGcFXxZjwQQ1F1M5T8qU3gi8fY2gvaXc` (the ID in the sheet URL; a full URL also works). Optional: `config/data-source.json` has the same default. |

To create a key for the existing `keyword-checker` service account (or a new, dashboard-only account, which is recommended): Google Cloud Console → project **cartup-keyword-search** → IAM & Admin → Service Accounts → the account → **Keys → Add key → Create new key → JSON**. Paste the downloaded file's contents into the secret, then **delete the file from your computer**. Never commit it.

### STEP 4 — Share the Google Sheet with the service account
Open the Google Sheet → **Share** → add the service account's email (`…@cartup-keyword-search.iam.gserviceaccount.com`) as **Viewer**. The sheet owner (or any editor) can do this, and ownership does not need to change. Viewer is enough because the dashboard only reads. Give **Editor** only to automation that writes to the sheet.

### STEP 5 — Enable the Google Sheets API
Google Cloud Console → APIs & Services → Library → **Google Sheets API** → Enable. It is already enabled for `cartup-keyword-search`.

### STEP 6 — Run the GitHub Action manually
Repository → **Actions** → **Sync Google Sheet & Deploy** → **Run workflow**.

### STEP 7 — Verify the generated data
Open the run and expand **Fetch Google Sheet data** and **Validate generated data**. You should see the spreadsheet title, the tabs found, the number of work rows, and any warnings (e.g. missing columns). If the step fails, the error says why (see [Troubleshooting](#troubleshooting)).

### STEP 8 — Enable GitHub Pages
Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**. Re-run the workflow if the first deploy ran before this was set.

### STEP 9 — Open the dashboard
`https://<your-github-username>.github.io/<repository-name>/`. The URL is also shown on the **deploy** job of each run.

From then on: **update the Google Sheet → within ~5–10 minutes the Action syncs → refresh the dashboard (it also re-checks automatically every 5 minutes).**

---

## Configuration

Values you may need to change live in two files. Neither holds secrets.

### `config/data-source.json` — what the Action reads
| Key | Purpose |
|---|---|
| `spreadsheetId` | Default sheet ID (the `GOOGLE_SHEET_ID` secret overrides it) |
| `tabs.work` / `tabs.kpi` | Tab names: `Work Sheet`, `KPI & Target` |
| `tabs.target` | Optional tab names to look for, e.g. `["Target"]`. If none exists, the dashboard works without it. |
| `tabs.sellerQc` / `sellerQcColumns` | Seller-uploaded QC tab used by the Individual Summary report. Only these columns are published. |
| `tabs.team` / `teamColumns` | Optional `Team Members` roster tab |
| `excludeColumns` | Columns **never published**. Defaults to `Seller Login ID` and `Seller Login Password`. |
| `dateColumns` | Columns converted from sheet date serials to dates |
| `expectedWorkColumns` | Used to find the header row and to warn about missing columns |

### `src/config/dashboard.config.ts` — how columns become metrics
- `columns`: every Work Sheet column the dashboard uses (defaults to the exact reference names, e.g. `Uploaded SKU Count`, `QC By`, `Edited (By AI)`).
- `statusGroups`: which `Status` values count as **Completed** (`Done`) and **Pending** (`Pending`, `Running`).
- `qcDoneValues` (`QC Done`) and `imageDeliveredValues` (`Delivered`).
- `recordRequiresAnyOf`: a row counts as work only if it has a Timestamp, Task Type or Shop Name. The sheet pre-fills JOB IDs on empty rows.
- `filterColumns`, `searchColumns`, `defaultTableColumns`, `personColumns`.
- `kpi`: how the KPI & Target tab is read (see below).
- `autoRefreshMinutes` (5) and `staleAfterMinutes` (a warning appears if the last sync is older than this).

After editing, commit to `main`. The workflow rebuilds automatically.

### How the KPI & Target tab is interpreted
The tab is a report layout, not a flat table: `A1` = `TODAY()`, `B1` = the KPI month, then blocks titled **Production Team**, **Visaul Team** and **QC Team**, each with its own header row. The dashboard:

1. finds each header row that contains the employee column (`Emplyee Name`, spelled as in the sheet),
2. uses the single-cell row above it as the team title,
3. pairs target and actual columns using `kpi.metricPairs`:

| Metric | Target column | Actual column |
|---|---|---|
| Sellers (month) | `MonthlyTarget (Sellers)` / `(Seller)` | `Achieved (Sellers)` |
| SKUs (month) | `No of SKUs` | `Total Achieved (SKUs)`, else `Achieved (SKUs)` |
| Images (month) | `ImageTarget` | `Achieved (Image)` |
| Sellers today | `DailyTarget (Sellers)` | `Today Achieved (Sellers)` |

4. computes Achievement % = Actual ÷ Target × 100 (N/A when Target is 0 or blank) and Gap = Actual − Target.

The **KPI Achievement %** headline card is the average of the team-level monthly achievements; hover it to see each part. Actual values are the ones Google Sheets computes with its own formulas, so the KPI section always reflects the month set in `B1`. If the layout changes, adjust the regexes in `kpi.metricPairs`. Unrecognised layouts show N/A plus a hint, never guessed numbers.

---

## Individual Summary report

**Reports → Individual Summary** builds the Cartup "Individual Summary — Week 37 vs Week 38" slide from live data. It opens on the last completed week vs the week before, so a report is **one click → PDF / Print** (choose "Save as PDF", or it prints on one 16:9 page).

Options (remembered in your browser):
- **Report type:** Weekly, Monthly or Yearly, any available period.
- **Compare with:** the previous week/month/year, or the same period last year.
- **Teams & people:** tick Production, Visual and/or QC, and tick who appears. *Auto* = active team members with work in either period. People who left are not pre-selected.
- **Summary line & Key Notes** are generated from the numbers and can be edited before printing.
- **Extra highlight boxes** for work that is not in the Work Sheet (Campaign Sticker, Keyword Tag Checking, Category Revamp…).
- **Excel** downloads the same tables.

How each number is calculated (checked against the Week 37 vs Week 38 template):

| Section | Calculation |
|---|---|
| Production — Seller / SKUs | Work Sheet rows by **Uploaded by** with **Upload date** in the period / Σ Uploaded SKU Count |
| Visual — Slr / Hand / AI / Total | Rows by **Visual editor** with **Image Delivered Date** in the period / Σ Edited (By Hand) / Σ Edited (By AI) / Σ Image count |
| QC — Upload | Σ (Approved QC Count + Rejected QC Count) by **QC By** and **QC approved date** |
| QC — Seller | Σ Number of SKUs in the **Admin portal QC import data** tab by QC By and QC Date |
| Upload backlog | Requests received before the period end and not uploaded by then (Rejected excluded) |
| Week numbers | Week 1 = first full Sun–Sat week of the year (13–19 Sep 2026 = Week 37), as in the template. Change `WEEK_NUMBERING` in `src/config/people.config.ts` to use the sheet's WEEKNUM instead. |

The **Product Governance** report is under **Reports → Product Governance** (see *Governance team tracker* below).

## Data updates (manual)

The dashboard no longer syncs automatically. To pull the latest Google Sheets data, click **Update data** (top right). The Apps Script starts the GitHub Action, and the page reloads itself when the new data is published, usually after 1–2 minutes. Without the Apps Script token the button opens **Actions → Run workflow** on GitHub instead. "Data from Google Sheets: …" shows when the data was last read. The small ↻ button only re-reads the already-published data.

To go back to automatic syncing, add a `schedule:` block to `.github/workflows/deploy.yml` (an example is in the file).

## Google Sheets used

| # | Spreadsheet | Tabs read | Used for |
|---|---|---|---|
| 1 | **Cartup Content Work Tracker** (`GOOGLE_SHEET_ID`) | `Work Sheet`, `KPI & Target`, `Admin portal QC import data`, optional `Team Members` | Every dashboard page, Individual Summary, KPI |
| 2 | **Governance Wrork Tracker** (`config → governance`) | `Main`, `Projects`, `Project Progress` | Ad-Hoc Tasks, REVAMP Projects, Product Governance report |
| 3 | **Catalogue Overall Performance** (variable `PERFORMANCE_SHEET_ID`) | `Daily Performance`, `Monthly Performance`, `KPI`, `Team`, `Import - ContentCommercial Work`, `Import - Retail Picks Upload…` | Daily / Monthly Performance report; Team tab "Resigned" = left the job |

Each spreadsheet must be shared with the service-account email as **Viewer**. Settings → **Connections** shows which tabs were found.

## Daily / Monthly Performance report

**Reports → Daily / Monthly Performance** reproduces the *Daily Performance* and *Monthly Performance* tabs of the Catalogue Overall Performance sheet. It shows the summary (uploaded / pending, QC done / pending, images) and Production, QC and Visual tables with targets and Achieved %. The daily view also shows QC within 48h / 72h / older and Retail Picks. It was checked against the sheet's own values for 27 Sep 2026 and every number matched. Targets come from those tabs: the standard target of each section, with KPI-tab blanks meaning no target. It has PDF / Print (A4 landscape) and Excel export.

## Governance team tracker

Two kinds of Governance work, both read from the **Governance Wrork Tracker** spreadsheet (`config/data-source.json → governance`):

| Page | Source | What it shows |
|---|---|---|
| **Governance → Ad-Hoc Tasks** | `Main` tab (Date, Task Type, Project Name, Shop Name, Product Count, Shop Count, Image Count, Source, Wroking By, Status, Note) | Tasks / products / shops / images by task type and person, weekly or monthly trend, filterable log, CSV |
| **Governance → REVAMP Projects** | `Projects` + `Project Progress` tabs (created and edited from the dashboard, or by hand) | Create / edit projects with every field of the report template, assign POC(s) and team, log progress per report line, pending fixes, overdue flags |
| **Reports → Product Governance** | both | "Product Governance — Week 37 vs Week 38" slide (weekly / monthly / yearly) with one block per project, editable text, PDF / **PowerPoint (editable .pptx)** / Excel |

Header names are matched flexibly (`src/config/governance.config.ts`), so the "Wroking By" typo or a later rename keeps working.

### REVAMP project fields (Product Governance template)

Each project becomes one block on the Product Governance slide. Everything is entered in **+ New project** / **Edit** and saved to the `Projects` tab:

| Field | Example from the template |
|---|---|
| Project name (block title), work type, description, Total SKUs, start / due date, status, priority | *QC Rejected Inactive to Live* |
| POC(s) and assigned team | *POC: Muntasir / Galib Hossain* |
| Table type | **Working / Updated** (*Highlight & Description — W37 Working 38,398 · Updated 28,220 …*), **Count** (*Brand Auth. — Seller Count 3 → 4*), **Status breakdown** (*Right / Wrong Category / Check Pending + Grand Total*), or **Reviewed / Found / Updated** |
| First column header, name of the number column | *Work Type* / *Category* / *Metric*, *Working* or *Worked* |
| Report lines (one per row) | *Highlight & Description*, *Category Shifting* |
| Numbers per week / month | **Sum** of the entries (daily work), or **Latest** entry (running totals copied from a tracker) |
| Report note, Show in report | *Product Name: title length/tag cleanup …* |

**Log progress** (inside a project) has one row per report line, and each line is saved as its own row in `Project Progress` (with a `Line` column). A project whose first entry falls in the reported week gets a **NEW** tag. In the report you can tick which blocks appear, edit any block's title or note, and edit the summary and key notes. Then download **PDF**, **PowerPoint** (every text box and table can be edited in PowerPoint / Google Slides) or **Excel**.

You can also edit the `Projects` / `Project Progress` tabs by hand. Columns are matched by header name (any order; extra columns of your own are kept). After an edit, click ↻ on the REVAMP Projects page.

### Switch on project assigning (one-time, ~5 minutes)

GitHub Pages cannot write to Google Sheets, so a small Google Apps Script does the writing:

1. Open the Governance spreadsheet → **Extensions → Apps Script**.
   *If Google shows "Sorry, unable to open the file at this time" (দুঃখিত, এই মুহূর্তে ফাইলটি খোলা গেল না):* this happens when more than one Google account is signed in. Use an **Incognito / private window** signed in with **only** the sheet owner's account, or open <https://script.google.com> → **New project** with that account. A standalone project works the same, because the script opens the Governance sheet by its ID (`SPREADSHEET_ID` at the top of `Code.gs`).
2. Delete what is in `Code.gs`, paste the contents of [`apps-script/Code.gs`](apps-script/Code.gs) (or use **Settings → Connections → Copy script**), click **Save**.
3. Choose the function **`setup`** in the toolbar → **Run** → allow the permissions. It uses your existing `Projects` and `Project Progress` tabs (it creates them only if they are missing) and writes any missing header cells into row 1. The `Main` tab is never modified.
4. **Deploy → New deployment** → gear icon → **Web app** → *Execute as:* **Me**, *Who has access:* **Anyone** → **Deploy** → copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
5. In GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable** named `GOVERNANCE_APPS_SCRIPT_URL` with that URL. (To try it at once in your own browser, paste the URL in **Settings → Connections → Use here**.)
6. Click **Update data** (or **Actions → Sync Google Sheet & Deploy → Run workflow**).

After that, REVAMP Projects shows **+ New project**, **Edit**, a status picker and **Log progress**. Changes are written to the Google Sheet immediately, and the page reads the tabs live through the same script, so there is no waiting for a sync.

If you later change `Code.gs`, use **Deploy → Manage deployments → Edit → Version: New version** so the URL stays the same. **Updating from v1.3:** paste the new `Code.gs`, run `setup` once (adds the new columns), and deploy a new version.

> Access: as chosen, anyone who has the dashboard link can create or edit projects and progress. The script only accepts the fields listed in `Code.gs`, validates numbers and dates, and neutralises formulas. It cannot read or change any other tab.

## Team Members (who left the job)

**Team Members** lists everyone found in the Work Sheet. For each person you can set the full name printed on reports, their team, and **Left the job** plus their last working day. A person who left is still included in reports for periods before that date. An "inactive 45d+" badge flags people with no recent work.

Where the roster comes from (highest priority first):
1. Changes made on the Team Members page. These are saved **in that browser only**.
2. An optional **`Team Members`** tab in the Google Sheet with columns `Name | Full Name | Team | Status | Left Date`. This is shared with everyone.
3. Defaults in `src/config/people.config.ts`.

To share your changes with everyone: click **Copy for Google Sheet**, paste into cell A1 of a `Team Members` tab, and the next sync (≤ 5 min) applies it for all viewers.

## Security

- The service-account key exists **only** in the `GOOGLE_SERVICE_ACCOUNT_JSON` GitHub secret. It is never written to disk in CI, never logged, and never bundled into the site.
- There are **no `VITE_*` variables**. Anything with that prefix ends up in the public JavaScript.
- `.gitignore` blocks `.env*`, `credentials/`, `secrets/`, `service_account.json`, `*service-account*.json`, generated data and `*.xlsx`, using specific rules rather than a blanket `*.json`.
- `data.json` is produced at build time and deployed as part of the site. It is **not committed**, so sheet data never enters git history.
- **Seller Login ID / Seller Login Password are removed before publishing** (`excludeColumns`).
- ⚠️ **GitHub Pages sites are publicly reachable** (unless your organisation has GitHub Enterprise Cloud with private Pages). Anyone with the URL can load `data/data.json`. The page carries `noindex`, but that is not access control. Consider also excluding personal contact columns (`Phone Number (KAM)`, `Mail (KAM)`, `Email Address`). If the data must be private, use Enterprise private Pages or put the site behind an access proxy such as Cloudflare Access.
- Use a dedicated service account with **Viewer** access to just this sheet, and rotate its key if it is ever exposed.
- CSV exports neutralise spreadsheet formula injection.

---

## Costs & schedule

- The schedule is the `cron` line in `.github/workflows/deploy.yml`. The default is `*/5 * * * *` (every 5 minutes, GitHub's minimum). GitHub may start scheduled runs a few minutes late during busy periods.
- Each run takes about 1–2 minutes. **Public repos: free.** **Private repos:** a 5-minute schedule uses roughly 9,000–17,000 Actions minutes a month, more than the free 2,000. Use `*/30 * * * *` (≈2,000–3,000) or `0 * * * *`, or a paid plan.
- GitHub disables schedules in repositories with no activity for 60 days. Re-enable them from the Actions tab.
- Manual refresh at any time: Actions → **Run workflow**.

---

## Local development

```bash
npm install
npm test               # unit tests for the data scripts
npm run dev            # http://localhost:5173 (shows "No data has been published yet" until data exists)

# Optional: fetch real data locally (key file kept OUTSIDE git)
mkdir -p credentials && cp /path/to/key.json credentials/service_account.json
cp .env.example .env
npm run fetch-data:local   # writes public/data/data.json (git-ignored)
npm run build && npm run preview
```

---

## Troubleshooting

| Message (Action log or dashboard) | Fix |
|---|---|
| `AUTH: GOOGLE_SERVICE_ACCOUNT_JSON is not set` | Add the secret (STEP 3). |
| `AUTH: Google rejected the service-account credentials` | The key was deleted/disabled or pasted incompletely. Create a new key. |
| `PERMISSION: Permission denied (HTTP 403)` | Share the sheet with the service-account email (STEP 4) and enable the Sheets API (STEP 5). |
| `NOT_FOUND: Spreadsheet … was not found` | Check `GOOGLE_SHEET_ID`. |
| `WORKSHEET_NOT_FOUND` | The `Work Sheet` tab was renamed. Update `tabs.work` in `config/data-source.json`. |
| `QUOTA` / `UNAVAILABLE` | Temporary. The script retries with backoff, and the last good dashboard stays online. |
| Dashboard: "No data has been published yet" | Run the Action (STEP 6) and enable Pages (STEP 8). |
| Dashboard: "Unable to load KPI data. Please check Google Sheet access." | The KPI & Target tab is missing or unreadable. The rest of the dashboard still works. |
| Dashboard: "data was last synced … ago" | Scheduled runs are failing or disabled. Check the Actions tab. |
| A metric shows **N/A** | Its column is missing or renamed. Settings → Data health lists what's missing. |

When a sync fails, nothing is deployed, so viewers keep seeing the last good data with its real "Last Updated" time.

---

## Project structure

```
.github/workflows/deploy.yml   Sync Google Sheet → build → deploy to GitHub Pages
config/data-source.json        Tabs, excluded columns, date columns (no secrets)
scripts/
  fetch-sheets.mjs             Entry point run by the Action (zero npm dependencies)
  lib/google-auth.mjs          Service-account JWT → access token (Node crypto)
  lib/sheets-api.mjs           Batched Sheets API reads, retries, friendly errors
  lib/transform.mjs            Header detection, date conversion, column exclusion
  transform.test.mjs           `npm test`
public/data/                   data.json is generated here at build time (git-ignored)
src/
  config/dashboard.config.ts   Column mapping, status groups, KPI pairs, defaults
  services/dataService.ts      Loads data.json with friendly errors
  hooks/                       Data loading + auto refresh, app state, routing, storage
  utils/                       Parsing, aggregation, filters, KPI parser, export
  charts/                      Bar list, trend chart, split bar, palette
  components/                  Layout, filter bar, work table, cards, states
  components/sections/         Dashboard sections (KPI, work, upload, QC, visual, team)
  pages/                       Dashboard, Work Sheet, KPI & Target, Team, Upload, QC,
                               Visual/Image, Reports, Settings
```

### `data.json` shape
```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "2026-09-30T05:30:00.000Z",
  "source": { "spreadsheetTitle": "…", "tabs": ["…"], "workSheet": "Work Sheet", "kpiSheet": "KPI & Target", "targetSheet": null, "excludedColumns": ["…"] },
  "work":   { "sheet": "Work Sheet", "columns": ["JOB ID", "Timestamp", "…"], "rows": [["CCWT0001", "2024-08-31T13:22:18", "…"]] },
  "kpi":    { "sheet": "KPI & Target", "values": [[…]], "formatted": [[…]] },
  "target": null,
  "warnings": []
}
```
Column names are exactly the sheet's headers. Rows are arrays (compact for large sheets), and GitHub Pages serves the file gzip-compressed (≈1 MB for ~10,000 rows).
