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

## Dashboard filters

The filters are Date, **Year**, Month, Vertical, Task Type, Status and **Employee**. **More filters** adds Uploaded by, QC By, Visual editor, Shop Name, L1 Category and the choice of which date the Date filter applies to.

- **Year** limits everything to one year; the Month list then shows only that year's months.
- **Employee** shows that person's **own** work in each role:
  - upload numbers count the jobs they uploaded;
  - QC numbers count the jobs they QC'd;
  - image numbers count the jobs they edited;
  - person tables list only them.

  The record list shows every job they worked on in any role.

## What counts for an employee

Every per-person number (Team Performance, the person charts, Team Member page, Individual Summary, the per-role exports and the employee detail report) uses one rule, set in `credit` in `src/config/dashboard.config.ts`:

| Role | Counted when | Dated by |
|---|---|---|
| Uploaded by | **Status = Done** | Upload date |
| QC By | **QC Status = QC Done / QC Rejected** | QC approved date |
| Visual editor | **Image Status = Delivered** | Image Delivered Date |

Work that is assigned but still **Running / Pending** (or Rejected) is **not** counted for the person. The Team Member page shows how many such rows exist, and the Work Sheet table still lists them. Date filters on per-person numbers use the role's own date, so an August request uploaded in September counts in September everywhere. The **KPI & Target** page shows the values calculated by the sheet's own formulas, and these can follow different rules.

**Employee detail report** (Reports → Individual Summary → *Employee detail report*): choose one person and download an Excel workbook for the selected two periods with these sheets:
- **Summary**: the same numbers as the slide, plus the person's KPI & Target tab lines.
- **Rows behind each number**: one sheet per role (*Production rows*, *Visual rows*, *QC rows*, *QC rows – seller*), with totals.
- **Not counted**: assigned work that was not counted, and why.
- **Governance Ad-Hoc / REVAMP progress**: included when the person appears there.

## Apps Script: stable service + auto-deploy

Since **v2.0** `apps-script/Code.gs` is a small, general **read rows / write cells** service. The Job desk, Task board and Governance pages build their requests in the website, which GitHub updates automatically, so **new features normally need no Apps Script change**.

The script still enforces these rules:
- **Sheets:** only the sheets listed in `SHEETS` can be read or written.
- **Writable columns (Work Sheet):** only the columns in `WORK_WRITABLE` can be changed. To change that list without redeploying, set the Script Property `WRITABLE_WORK`.
- **Hidden columns:** login, password, phone and mail columns are never read or written.
- **Formula columns:** never overwritten.
- **`expect` check:** if a row changed after the person loaded it, nothing is written for that row.
- **Form Log:** every Work Sheet change is logged there.

**Apps Script auto-deploy (optional).** For the rare times the script itself changes, the workflow `.github/workflows/apps-script.yml` pushes it with Google's `clasp` tool and updates the **existing** Web app deployment, so the URL stays the same. It skips itself until these are set:
1. Turn on *Google Apps Script API* at <https://script.google.com/home/usersettings>.
2. In Google Cloud Shell, run `npx @google/clasp@2.4.2 login --no-localhost`, then `cat ~/.clasprc.json`. Save the output as the GitHub **secret** `CLASPRC_JSON`. It is a login key for that Google account, so keep the repository's collaborators to people you trust.
3. Copy the Apps Script **Script ID** (Project Settings) into the GitHub **variable** `APPS_SCRIPT_ID`. The deployment is taken from `GOVERNANCE_APPS_SCRIPT_URL`; to use a different one, set `APPS_SCRIPT_DEPLOYMENT_ID`.

`apps-script/appsscript.json` is the project manifest (time zone Asia/Dhaka, V8, Web app: execute as owner, access: anyone).

## Job desk (employees) and Assign page (team leads)

| Page | Who | URL |
|---|---|---|
| **Job desk** | all employees | `https://<user>.github.io/<repo>/form.html` (`?job=CCWT10000` opens a job) |
| **Task board** | team leads only — share this link only with them | `https://<user>.github.io/<repo>/assign.html` |

**Job desk → Search.** Search by JOB ID, Seller Code or shop name to see:
- Shop, Seller Code, KAM and Number of SKU.
- Who uploads, does QC and edits images.
- Uploaded SKU count.
- A line per stage: done, "not done yet — assigned to X", or "not done yet — not assigned".

**Job desk → Update my task.**
1. Check a JOB ID, then update Status, Uploaded SKU Count, Rejected SKU Count (column AC), Upload date, Upload Month and Comments. Only fields the person actually changes are written.
2. A column calculated by a formula is left alone, and "Uploaded by" is filled only when it is empty.

**Task board (assign.html).** For team leads. It loads every unfinished job plus the last 7/30/90 days live from the Work Sheet.
- **Work type tabs:** Upload, Image or QC.
- **One-click filter cards:** Not assigned, Open, Pending, Running, Done, Rejected, All.
- **More filters:** search (or paste many JOB IDs), task type, KAM, person, period, and sort (oldest request first by default).
- **Job table:** JOB ID, age in days (red after 3 days), task, shop and seller code, KAM, SKUs, status, Uploaded by, Visual editor (with Image Status), QC By (with QC Status).
- **In hand panel:** Pending / Running / Open / Done per person. Click a name to filter.
- **Assigning:** tick jobs (or the header box to select everything shown), choose a person in the bottom bar (names show how many jobs they have in hand, least busy first), and click **Assign**. For uploads it can also set Status to Running. People already assigned are kept unless *replace existing* is ticked.

**Never overwritten by old data.** Every save sends the values the person saw when they clicked Check. If the row changed in the meantime (someone else updated it), nothing is written and they are asked to check again. Every change is recorded in the **Form Log** tab (time, JOB ID, who, field, old → new).

**One-time setup:** share the main *Cartup Content Work Tracker* sheet with the Apps Script's Google account as **Editor**, paste the latest `apps-script/Code.gs`, and use **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. Settings → Connections warns when the deployed script is older than the one in this repository.

### Saving "Done" on the Job desk

- **QC Status:** when a job is saved as **Done**, QC Status is set to **QC Pending** (unless it already has a QC result for this upload).
- **Number of SKU:** set to the **Uploaded SKU Count** the employee enters.
- **Both sheets:** both changes are also copied to Content/Commercial when "Also update" is ticked.
- **Needs Apps Script 2.1.6 or later**, which allows Number of SKU to be written.

### My tasks (Job desk)

On the Job desk's **Search** tab, an employee picks their name and sees:
- **Upload pending** and **Upload running:** their jobs by Status;
- **Images in hand:** not yet delivered;
- **QC in hand:** not yet QC'd.

Each job row shows JOB ID, Shop, **Seller Code** (column N), **Note** (column L), SKU, age, a **Google drive link** (column F; "Open ↗" opens it in a new tab) and Status. Hover over any cell to show a **copy** button (⧉ → ✓ when copied; the Drive cell copies the full link). On touch screens the button stays faintly visible. On a phone the table shows JOB ID, Shop and Seller Code; on a narrow desktop window it scrolls sideways. A **Requested from / to** calendar filters the counts and the list by the day the job was requested. Click a job (anywhere but a copy button or link) to open it in **Update my task**.

### Task board filters

- **Day / Month:** finished work counts on the day it was finished (Upload date / Image Delivered Date / QC approved date); open work counts on the day it was requested. The board loads far enough back to cover the chosen day or month.
- **QC tab cards:** **QC Pending (uploaded)** and **QC Done** replace Pending, Running, Done and Rejected.
- **What each tab loads:** its own unfinished work, so QC sees every uploaded job waiting for QC.

### Microsoft Teams message on assign (Task board)

The assign bar has an optional **message Teams** checkbox. It is **unchecked by default**, and the board remembers your choice. When it is ticked, clicking **Assign** posts a short message per person to your Teams channel:

```
@Iftakhar
CCWT9019
CCWT9020
CCWT9032
```

Only jobs actually assigned in that click are listed. Jobs kept with their current person are left out. The message is built by the Apps Script from the Work Sheet, so the website cannot post any other text. The result box under the board says whether the message was sent and, if not, why.

**Setup (once, needs Apps Script 2.1.9 or later):**
1. In Teams, open the channel → **•••** → **Workflows** → **Post to a channel when a webhook request is received**. Pick the team and channel, then copy the URL it gives.
2. In the Apps Script project: **Project Settings → Script Properties → Add property**. Set `TEAMS_WEBHOOK` to that URL and save. The link stays in the script and is never in the website or on GitHub.
3. Paste the new Code.gs, save, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
4. Optional, for a real Teams @mention that notifies the person: add the Script Property `TEAMS_PEOPLE` = `{"Iftakhar":"iftakhar@yourcompany.com", …}`, using each person's Teams sign-in email and their name exactly as it appears in the Work Sheet. Without it, the name is posted as plain text "@Iftakhar".

Settings → Connections shows "Teams message on assign ready" once `TEAMS_WEBHOOK` is set.

### Daily report message (Task board)

Open **Daily report message** on the Task board and pick a day. There are two messages: **Production report** and **QC report**. You can edit either one before copying it.

The QC report (`Total QC` / `No. of Sellers`) adds up Approved + Rejected QC Count of everything QC'd that day, from three sheets. This is the same rule as the Daily Performance tab:

| Sheet | Rows counted |
|---|---|
| Cartup Content Work Tracker → Work Sheet | QC Status "QC Done", QC approved date = that day |
| Admin Portal Pending QC → Seller QC Data | QC Status "Done", QC Date = that day |
| Content/Commercial → Uplaod Responses Form | Task Type (column B) "Seller Upload QC", QC Status "QC Done", QC Date = that day |

No. of Sellers is the number of those rows. Reading the Admin Portal sheet needs Apps Script 2.1.7 or later; without it the report shows a warning.

**Download Excel (calculation)** saves every row behind the numbers for the chosen day:
- a **Summary** tab with the rule, row count and total per sheet;
- one tab each for QC – Work Sheet, QC – Admin Portal, QC – Seller Upload QC, QC Pending, Uploaded, Images and Upload Pending, with totals at the bottom.

The production report looks like this:

```
24/09/2026
Uploaded SKUs: 5,413 (Seller Done 22)
Image Edited: 21,643 (Seller 17)
Seller Upload Pending: 79 Seller
```

How each line is counted:
- **Uploaded SKUs:** Uploaded SKU Count of jobs marked Done with that Upload date. *Seller Done* is the number of those jobs.
- **Image Edited:** total Image count of jobs with that Image Delivered Date. *Seller* is the number of those jobs.
- **Seller Upload Pending:** jobs requested by the end of that day and not uploaded by then. Rejected jobs are left out.

### Copy to "Cartup Work Tracker Content/Commercial"

Under the Save button, the Job desk has a checkbox **"Also update Cartup Work Tracker Content/Commercial (Uplaod Responses Form)"**. It is on by default and remembered per browser.
- **On ("Save to both sheets"):** after the Work Sheet row is saved, the Apps Script copies these columns to the row with the same **JOB ID** (column **S**) in that tab. If the JOB ID is not in that tab, nothing is copied and the form says so. Columns copied:

  | Work Sheet | Content/Commercial |
  |---|---|
  | Number of SKU, Uploaded SKU Count | Number of SKU, Uploaded SKU Count |
  | Status | Upload Status |
  | Rejected SKU Count + Comments | Catalogue Comment, written as `15 rejected. <comments>` |
  | Approved QC Count / Rejected QC Count | Approved QC Count / Rejected QC Count |
  | Upload date | Upload Date |
  | QC approved date | QC Date |
  | QC Status | QC Status |

  Empty Work Sheet cells never clear the other sheet, and formula columns are skipped. Each copy is recorded in the Form Log.
- **Off:** only the Work Sheet is updated.

**Needs Apps Script 2.1.7 or later.** The account the script runs as must have **Editor** access to that spreadsheet; Settings → Connections shows whether it can write. Two Script Properties change the behaviour without redeploying: `COMMERCIAL_MAP` (JSON) changes the column mapping, and `COMMERCIAL_JOB_COL` changes the JOB ID column letter.

## Individual Summary report

**Reports → Individual Summary** builds the Cartup "Individual Summary — Week 37 vs Week 38" slide from live data. It opens on the last completed week vs the week before, so a report is **one click → PDF / Print** (choose "Save as PDF", or it prints on one 16:9 page).

Options (remembered in your browser):
- **Report type:** Weekly, Monthly or Yearly, any available period.
- **Compare with:** the previous week/month/year, or the same period last year.
- **Teams & people:** tick Production, Visual and/or QC, and tick who appears. *Auto* = active team members with work in either period. People who left are not pre-selected.
- **Summary line & Key Notes** are generated from the numbers and can be edited before printing.
- **Extra highlight boxes** for work that is not in the Work Sheet (Campaign Sticker, Keyword Tag Checking, Category Revamp…).
- **Retail [Picks] uploads** are added to the **Production** table (sellers = rows, SKUs = column **F** of the Retail sheet, set by `extraSources.retail.columns.skus` in `config/data-source.json`). Names that differ slightly between sheets ("Iftkhar" / "Iftakhar") count as the same person. **Pending QC (Admin Portal, now)** is shown in At a Glance. Each appears only when its sheet is connected.
- **Ad-Hoc Task tables:** tick people to add an "Ad-Hoc Task · <name>" table: SKUs (Product Count) per task type from the Governance Main tab, previous vs current period, with Δ and a total.
- **Project tables:** REVAMP projects set to *Individual Summary* or *Both* appear as tables on this slide. Their "At a Glance" line (if set) is added to the panel. Tick which ones appear.
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

## Monthly Report

**Reports → Monthly Report** builds the "August 2026 Monthly Report" deck for any month (default: the last completed month):

| Slide | Numbers |
|---|---|
| Title, Key Highlights | Written from the numbers below |
| 1 Production · 2 QC · 3 Visual | Team totals of the Monthly Performance report. Target = Σ targets of the people who worked that month; Achieved % = team total ÷ team target |
| 4.x Governance | One slide per REVAMP project with *Include in reports* on. *Sum* projects show the month's entries added up; running-total projects show `+change (before → end of month)` |
| 5.x Other / Ad-Hoc | Governance Main tab rows dated in the month, grouped by task type and by person, plus an optional breakdown slide per person |
| Team Achievement Overview | Achieved % chart for Production / QC / Visual, plus the Governance and Ad-Hoc totals |

**Click any text on a slide to edit it.** That includes titles, notes, highlight lines and every table cell. Edits are saved in your browser per month; clear a text to get the automatic one back. You can also hide or reorder slides, and add **text slides** (with 0–3 cards and a COMPLETE / IN PROGRESS badge) for work that is not in the sheets. Download **PowerPoint**, where every text box, table and the chart stay editable, or **PDF / Print** (one 16:9 page per slide).

## Data updates (manual)

The dashboard no longer syncs automatically. To pull the latest Google Sheets data, click **Update data** (top right). The Apps Script starts the GitHub Action, and the page reloads itself when the new data is published, usually after 1–2 minutes. Without the Apps Script token the button opens **Actions → Run workflow** on GitHub instead. "Data from Google Sheets: …" shows when the data was last read. The small ↻ button only re-reads the already-published data.

To go back to automatic syncing, add a `schedule:` block to `.github/workflows/deploy.yml` (an example is in the file).

## Google Sheets used

| # | Spreadsheet | Tabs read | Used for |
|---|---|---|---|
| 1 | **Cartup Content Work Tracker** (`GOOGLE_SHEET_ID`) | `Work Sheet`, `KPI & Target`, `Admin portal QC import data`, optional `Team Members` | Every dashboard page, Individual Summary, KPI |
| 2 | **Governance Wrork Tracker** (`config → governance`) | `Main`, `Projects`, `Project Progress` | Ad-Hoc Tasks, REVAMP Projects, Product Governance report |
| 3 | **Catalogue Overall Performance** (variable `PERFORMANCE_SHEET_ID`) | `Daily Performance`, `Monthly Performance`, `KPI`, `Team`, `Import - ContentCommercial Work`, `Import - Retail Picks Upload…` | Daily / Monthly Performance report; Team tab "Resigned" = left the job |
| 4 | **Retail [Picks] Upload Request, Import** (`config → extraSources.retail`) | the tab with gid `1610558392` | Individual Summary: Retail Picks table per uploader + "Retail SKUs Uploaded" |
| 5 | **Admin Portal Pending QC** (`config → extraSources.pendingQc`) | the tab with gid `0` | Individual Summary: "Pending QC (Admin Portal, now)" |

Sheets 4 and 5 are read-only views. Their columns are detected by header name, and Settings → Connections lists what was found and what is missing.

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

#### Custom tables (+ New project)

**+ New project** starts from a template, and a **live preview** of the report block updates while you edit:

| Template | Example |
|---|---|
| Check per person + target | *Search Keyword Error Checking (Target: 1,000)* — Assign · Issue Found · Already Ok · Pending · Count, *Unique Total* row |
| Per person, compare weeks | *Campaign — Sticker Image* — W38 · W39 · Δ per person |
| Metrics, compare weeks | *Electronics Category Revamp* — Total SKUs / Reviewed / Wrong Found / Updated / Pending, W38 · W39 |
| Working / Updated, Status breakdown, Counts | the Product Governance blocks |
| Blank custom table | your own design |

In a **custom table** you choose the following:
- **Columns:** add, rename, reorder and remove them. Each column is a *number people enter* or a *total of the number columns*.
- **Rows:** a list you type, or the assigned people (one row each).
- **Compare:** previous vs current period, or the current period only.
- **Total row:** add one and choose its label.
- **Target:** shown in the title.
- **Δ column.**

For every project you also choose:
- **Show in:** the Product Governance report, the Individual Summary, or both.
- **"At a Glance" line:** an optional label, a main number and small extra numbers.

Entries are saved to `Project Progress` with the numbers in a `Values` column (JSON, e.g. `{"Issue Found":120,"Already Ok":300}`). The new `Projects` columns (`Columns`, `Rows`, `Compare`, `Show Delta`, `Total Label`, `Target`, `Reports`, `Glance`) are added by the Apps Script automatically, so no new deployment is needed.

**Log progress** (inside a project) has one row per report line, and each line is saved as its own row in `Project Progress` (with a `Line` column). A project whose first entry falls in the reported week gets a **NEW** tag. In the report you can tick which blocks appear, edit any block's title or note, and edit the summary and key notes. Then download **PDF**, **PowerPoint** (every text box and table can be edited in PowerPoint / Google Slides) or **Excel**.

You can also edit the `Projects` / `Project Progress` tabs by hand. Columns are matched by header name (any order; extra columns of your own are kept). After an edit, click ↻ on the REVAMP Projects page.

### Switch on project assigning (one-time, ~5 minutes)

GitHub Pages cannot write to Google Sheets, so a small Google Apps Script does the writing:

1. Open the Governance spreadsheet → **Extensions → Apps Script**.
   *If Google shows "Sorry, unable to open the file at this time" (দুঃখিত, এই মুহূর্তে ফাইলটি খোলা গেল না):* this happens when more than one Google account is signed in. Use an **Incognito / private window** signed in with **only** the sheet owner's account, or open <https://script.google.com> → **New project** with that account. A standalone project works the same, because the script opens the Governance sheet by its ID (`SPREADSHEET_ID` at the top of `Code.gs`).
2. Delete what is in `Code.gs`, paste the contents of [`apps-script/Code.gs`](apps-script/Code.gs) (or use **Settings → Connections → Copy script**), click **Save**.
3. Choose the function **`setup`** in the toolbar → **Run** → allow the permissions. It uses your existing `Projects` and `Project Progress` tabs (it creates them only if they are missing) and writes any missing header cells into row 1. The `Main` tab is never modified.
4. **Deploy → New deployment** → gear icon → **Web app** → *Execute as:* **Me**, *Who has access:* **Anyone** → **Deploy** → copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
5. Put that URL in `config/data-source.json` → `governance.appsScriptUrl`. It is used for everyone and wins over the older GitHub variable `GOVERNANCE_APPS_SCRIPT_URL`. (To try it at once in your own browser, paste the URL in **Settings → Connections → Use here**.)
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

**People who left are hidden from every name list:**
- the dashboard's Employee filter and Team Member picker;
- REVAMP project and Ad-Hoc filters and pickers;
- report pickers;
- the Job desk's "Your name" list;
- the Task board's lead, filter and **Assign to** lists.

The All tab on Team Members lists Active people first, then those who left. Their past work stays in the numbers and reports.

The Job desk and Task board get the list from the sync, which uses the Team tab ("Resigned") and the `Team Members` tab. They also apply changes saved on the Team Members page in the same browser. To hide someone on everyone's devices, put the change in the Google Sheet.

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
