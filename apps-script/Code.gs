/**
 * Cartup Governance — REVAMP project assign API.
 *
 * Works in two ways (pick one):
 *  A) From the Governance sheet: Extensions → Apps Script.
 *  B) If that shows "Sorry, unable to open the file at this time" (happens when
 *     several Google accounts are signed in): open https://script.google.com
 *     with ONLY the sheet owner's account (e.g. an Incognito window) →
 *     New project. The script opens the sheet by its ID, so it works the same.
 * Replace Code.gs with this file → Save → run `setup` once (authorise) →
 *   Deploy → New deployment → type "Web app" →
 *   Execute as: Me · Who has access: Anyone → Deploy → copy the Web app URL.
 * Put that URL in GitHub: Settings → Secrets and variables → Actions →
 *   Variables → New repository variable GOVERNANCE_APPS_SCRIPT_URL.
 *
 * The script only writes to the "Projects" and "Project Progress" tabs. If you
 * created them yourself, `setup` adds any missing header cells to row 1 and
 * keeps your columns; columns are always matched by header name, so you may
 * re-order them or add your own. The "Main" Ad-Hoc tab is never modified.
 *
 * Optional — "Update data" button on the dashboard:
 *   Project Settings (gear) → Script Properties → add
 *     GITHUB_TOKEN = a fine-grained GitHub token with access to ONLY the
 *                    cartup-work-tracker repo, permission "Actions: Read and write"
 *     GITHUB_REPO  = mojumder01/cartup-work-tracker
 *   The token stays inside Google; the browser never sees it.
 */

var SPREADSHEET_ID = '1Bw1lfwvEJfFOx_1HFifPqdr6KoG9XQ8rAJiNAboN5T4';
var PROJECTS_TAB = 'Projects';
var PROGRESS_TAB = 'Project Progress';
var PROJECT_HEADERS = ['Project ID', 'Created At', 'Project Name', 'Work Type', 'Description', 'POC', 'Assignees',
  'Total SKUs', 'Start Date', 'Due Date', 'Status', 'Priority', 'Found Label', 'Updated At', 'Updated By',
  'Report Layout', 'Line Header', 'Lines', 'Value Mode', 'Report Note', 'Show In Report'];
var PROGRESS_HEADERS = ['Log ID', 'Timestamp', 'Project ID', 'Date', 'Person', 'Reviewed', 'Found', 'Updated', 'Note', 'Line'];
var STATUSES = ['Planned', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
var PRIORITIES = ['High', 'Medium', 'Low'];
var LAYOUTS = ['Reviewed / Found / Updated', 'Working / Updated', 'Count', 'Status breakdown'];
var MODES = ['Sum', 'Latest'];
var EDITABLE = ['Project Name', 'Work Type', 'Description', 'POC', 'Assignees', 'Total SKUs', 'Start Date', 'Due Date',
  'Status', 'Priority', 'Found Label', 'Report Layout', 'Line Header', 'Lines', 'Value Mode', 'Report Note', 'Show In Report'];

/** Run once from the editor: creates the tabs or completes their header row. */
function setup() {
  var a = sheet_(PROJECTS_TAB, PROJECT_HEADERS);
  var b = sheet_(PROGRESS_TAB, PROGRESS_HEADERS);
  return 'Ready: ' + PROJECTS_TAB + ' (' + a.getLastColumn() + ' columns), ' + PROGRESS_TAB + ' (' + b.getLastColumn() + ' columns)';
}

function account_() {
  try {
    return Session.getEffectiveUser().getEmail() || 'this script\'s account';
  } catch (e) {
    return 'this script\'s account';
  }
}

function ss_() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
    throw new Error('The Apps Script runs as ' + account_() + ', and that account cannot open the Governance sheet. ' +
      'Fix: share the Governance sheet with ' + account_() + ' as Editor (Share button), or create the script with the ' +
      'sheet owner\'s account. Also check Deploy → Manage deployments → Execute as: Me.');
  }
}

/** The tab, created if missing; any missing header cells are added to row 1. */
function sheet_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    // Tolerate small differences such as extra spaces or a different case.
    var want = name.toLowerCase().replace(/\s+/g, ' ').trim();
    sh = ss.getSheets().filter(function (x) { return x.getName().toLowerCase().replace(/\s+/g, ' ').trim() === want; })[0] || null;
  }
  if (!sh) sh = ss.insertSheet(name);
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var row1 = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var have = row1.map(function (h) { return h.toLowerCase(); });
  var missing = headers.filter(function (h) { return have.indexOf(h.toLowerCase()) < 0; });
  if (missing.length) {
    var used = row1.filter(function (h) { return h !== ''; }).length;
    // Empty header row → write from column A; otherwise append after the last header.
    var at = used === 0 ? 1 : lastCol + 1;
    sh.getRange(1, at, 1, missing.length).setValues([missing]).setFontWeight('bold');
    if (sh.getFrozenRows() === 0) sh.setFrozenRows(1);
  }
  return sh;
}

/** { 'Header Name': columnIndex (0-based) } using the sheet's real row 1. */
function headerMap_(sh) {
  var row1 = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  var m = {};
  row1.forEach(function (h, i) {
    var k = String(h).trim();
    if (k && m[k] === undefined) m[k] = i;
  });
  // Case-insensitive fallback for the names the script uses.
  PROJECT_HEADERS.concat(PROGRESS_HEADERS).forEach(function (h) {
    if (m[h] !== undefined) return;
    row1.forEach(function (x, i) { if (m[h] === undefined && String(x).trim().toLowerCase() === h.toLowerCase()) m[h] = i; });
  });
  m._width = row1.length;
  return m;
}

/** Writes object values into a row array at the columns named by the header map. */
function toRow_(map, obj, base) {
  var row = base ? base.slice() : [];
  while (row.length < map._width) row.push('');
  Object.keys(obj).forEach(function (k) { if (map[k] !== undefined) row[map[k]] = obj[k]; });
  return row;
}

/** Row number (1-based) whose column `header` equals `value`, or -1. */
function findRow_(sh, map, header, value) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var col = sh.getRange(2, map[header] + 1, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]) === value) return i + 2;
  return -1;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Rows as objects keyed by header; dates as yyyy-mm-dd / ISO strings. */
function readTab_(name, headers) {
  var sh = sheet_(name, headers);
  var values = sh.getDataRange().getValues();
  var head = (values.shift() || []).map(function (h) { return String(h).trim(); });
  var idCol = head.map(function (h) { return h.toLowerCase(); }).indexOf(headers[0].toLowerCase());
  var tz = Session.getScriptTimeZone();
  return values.filter(function (r) { return idCol < 0 || r[idCol] !== ''; }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) {
      if (!h) return;
      var canon = headers.filter(function (x) { return x.toLowerCase() === h.toLowerCase(); })[0] || h;
      var v = r[i];
      if (v instanceof Date) {
        v = /At$|Timestamp/.test(canon) ? Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ss") : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      }
      o[canon] = v === '' ? null : v;
    });
    return o;
  });
}

/** GET ?action=list → { ok, projects, progress } (live data, no waiting for the sync). */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'list';
    if (action === 'ping') {
      var sheet = { ok: true, error: null };
      try { ss_(); } catch (err) { sheet = { ok: false, error: String(err && err.message ? err.message : err) }; }
      return json_({ ok: true, sync: !!github_(), sheet: sheet.ok, sheetError: sheet.error, account: account_() });
    }
    if (action === 'syncStatus') return json_(syncStatus_());
    return json_({ ok: true, projects: readTab_(PROJECTS_TAB, PROJECT_HEADERS), progress: readTab_(PROGRESS_TAB, PROGRESS_HEADERS) });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// ---- validation helpers -------------------------------------------------

function str_(v, max) {
  var s = v === null || v === undefined ? '' : String(v).trim();
  if (s.length > (max || 200)) s = s.slice(0, max || 200);
  // Stop formula injection: text starting with = + - @ is stored as text.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function num_(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(String(v).replace(/,/g, ''));
  if (!isFinite(n) || n < 0 || n > 1e9) throw new Error('Invalid number: ' + v);
  return Math.round(n);
}
function day_(v) {
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error('Invalid date: ' + v);
  return String(v);
}
function oneOf_(v, list, dflt) {
  return list.indexOf(v) >= 0 ? v : dflt;
}
function id_(v, prefix) {
  var s = String(v || '');
  if (!new RegExp('^' + prefix + '-[A-Z0-9-]{4,40}$').test(s)) throw new Error('Invalid id');
  return s;
}

/** Validated project fields → { header: value } (only the keys present in p). */
function projectFields_(p) {
  var o = {};
  var has = function (k) { return p[k] !== undefined && p[k] !== null; };
  if (has('Project Name')) o['Project Name'] = str_(p['Project Name'], 120);
  if (has('Work Type')) o['Work Type'] = str_(p['Work Type'], 80);
  if (has('Description')) o['Description'] = str_(p['Description'], 1000);
  if (has('POC')) o['POC'] = str_([].concat(p['POC']).join(', '), 200);
  if (has('Assignees')) o['Assignees'] = str_([].concat(p['Assignees']).join(', '), 500);
  if (has('Total SKUs')) o['Total SKUs'] = num_(p['Total SKUs']);
  if (has('Start Date')) o['Start Date'] = day_(p['Start Date']);
  if (has('Due Date')) o['Due Date'] = day_(p['Due Date']);
  if (has('Status')) o['Status'] = oneOf_(p['Status'], STATUSES, 'Planned');
  if (has('Priority')) o['Priority'] = oneOf_(p['Priority'], PRIORITIES, 'Medium');
  if (has('Found Label')) o['Found Label'] = str_(p['Found Label'], 60);
  if (has('Report Layout')) o['Report Layout'] = oneOf_(p['Report Layout'], LAYOUTS, LAYOUTS[0]);
  if (has('Line Header')) o['Line Header'] = str_(p['Line Header'], 40);
  if (has('Lines')) o['Lines'] = str_([].concat(p['Lines']).join('; '), 1000);
  if (has('Value Mode')) o['Value Mode'] = oneOf_(p['Value Mode'], MODES, 'Sum');
  if (has('Report Note')) o['Report Note'] = str_(p['Report Note'], 1000);
  if (has('Show In Report')) o['Show In Report'] = p['Show In Report'] === 'No' ? 'No' : 'Yes';
  return o;
}

function logFields_(l, now) {
  return {
    'Log ID': id_(l['Log ID'], 'LOG'),
    'Timestamp': now,
    'Project ID': id_(l['Project ID'], 'PRJ'),
    'Date': day_(l['Date']) || now.slice(0, 10),
    'Person': str_(l['Person'], 60),
    'Reviewed': num_(l['Reviewed']) || 0,
    'Found': num_(l['Found']) || 0,
    'Updated': num_(l['Updated']) || 0,
    'Note': str_(l['Note'], 500),
    'Line': str_(l['Line'], 80),
  };
}

/** Appends progress rows, skipping ids already in the tab. */
function appendLogs_(list, now) {
  if (!list.length || list.length > 100) throw new Error('Send 1–100 progress entries');
  var sh = sheet_(PROGRESS_TAB, PROGRESS_HEADERS);
  var map = headerMap_(sh);
  var rows = list.map(function (l) { return logFields_(l || {}, now); });
  var fresh = rows.filter(function (r) { return findRow_(sh, map, 'Log ID', r['Log ID']) < 0; });
  if (fresh.length) {
    sh.getRange(sh.getLastRow() + 1, 1, fresh.length, map._width).setValues(fresh.map(function (r) { return toRow_(map, r, null); }));
  }
  return rows.map(function (r) { return r['Log ID']; });
}

/**
 * POST body (sent as text/plain JSON):
 *   { action: 'createProject', project: {...}, by: 'Name' }
 *   { action: 'updateProject', id: 'PRJ-…', changes: {...}, by: 'Name' }
 *   { action: 'logProgress', log: {...} }  or  { action: 'logProgress', logs: [{...}, …] }
 *   { action: 'deleteLog', id: 'LOG-…' }
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var tz = Session.getScriptTimeZone();
    var now = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss");

    if (body.action === 'triggerSync') return json_(triggerSync_());

    if (body.action === 'createProject') {
      var p = body.project || {};
      if (!str_(p['Project Name'])) throw new Error('Project name is required');
      var sh = sheet_(PROJECTS_TAB, PROJECT_HEADERS);
      var map = headerMap_(sh);
      var id = id_(p['Project ID'], 'PRJ');
      if (findRow_(sh, map, 'Project ID', id) > 0) return json_({ ok: true, id: id, duplicate: true });
      var f = projectFields_(p);
      f['Project ID'] = id;
      f['Created At'] = now;
      if (!f['Status']) f['Status'] = 'Planned';
      if (!f['Show In Report']) f['Show In Report'] = 'Yes';
      f['Updated At'] = now;
      f['Updated By'] = str_(body.by, 60);
      sh.getRange(sh.getLastRow() + 1, 1, 1, map._width).setValues([toRow_(map, f, null)]);
      return json_({ ok: true, id: id });
    }

    if (body.action === 'updateProject') {
      var pid = id_(body.id, 'PRJ');
      var sh2 = sheet_(PROJECTS_TAB, PROJECT_HEADERS);
      var map2 = headerMap_(sh2);
      var r = findRow_(sh2, map2, 'Project ID', pid);
      if (r < 0) throw new Error('Project not found');
      var changes = {};
      EDITABLE.forEach(function (k) { if (body.changes && body.changes[k] !== undefined) changes[k] = body.changes[k]; });
      var g = projectFields_(changes);
      g['Updated At'] = now;
      g['Updated By'] = str_(body.by, 60);
      var current = sh2.getRange(r, 1, 1, map2._width).getValues()[0];
      sh2.getRange(r, 1, 1, map2._width).setValues([toRow_(map2, g, current)]);
      return json_({ ok: true, id: pid });
    }

    if (body.action === 'logProgress') {
      var ids = appendLogs_(body.logs ? [].concat(body.logs) : [body.log || {}], now);
      return json_({ ok: true, id: ids[0], ids: ids });
    }

    if (body.action === 'deleteLog') {
      var delId = id_(body.id, 'LOG');
      var sh4 = sheet_(PROGRESS_TAB, PROGRESS_HEADERS);
      var row = findRow_(sh4, headerMap_(sh4), 'Log ID', delId);
      if (row < 0) throw new Error('Log not found');
      sh4.deleteRow(row);
      return json_({ ok: true, id: delId });
    }

    throw new Error('Unknown action');
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

// ---- "Update data" button: start the GitHub Action ------------------------

function github_() {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty('GITHUB_TOKEN');
  var repo = p.getProperty('GITHUB_REPO');
  if (!token || !repo) return null;
  return { token: token, repo: repo, workflow: p.getProperty('GITHUB_WORKFLOW') || 'deploy.yml', ref: p.getProperty('GITHUB_REF') || 'main' };
}

function ghFetch_(gh, path, options) {
  var opts = options || {};
  opts.headers = { Authorization: 'Bearer ' + gh.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  opts.muteHttpExceptions = true;
  return UrlFetchApp.fetch('https://api.github.com/repos/' + gh.repo + path, opts);
}

function syncStatus_() {
  var gh = github_();
  if (!gh) return { ok: false, error: 'GITHUB_TOKEN / GITHUB_REPO script properties are not set.' };
  var res = ghFetch_(gh, '/actions/workflows/' + gh.workflow + '/runs?per_page=1&branch=' + encodeURIComponent(gh.ref));
  if (res.getResponseCode() !== 200) return { ok: false, error: 'GitHub returned HTTP ' + res.getResponseCode() };
  var run = (JSON.parse(res.getContentText()).workflow_runs || [])[0];
  return { ok: true, run: run ? { number: run.run_number, status: run.status, conclusion: run.conclusion, createdAt: run.created_at, url: run.html_url } : null };
}

function triggerSync_() {
  var gh = github_();
  if (!gh) return { ok: false, error: 'The Update button is not set up: add GITHUB_TOKEN and GITHUB_REPO in the Apps Script project properties.' };
  // At most one start per 90 seconds, and never while a run is already going.
  var cache = CacheService.getScriptCache();
  if (cache.get('syncStarted')) return { ok: true, alreadyRunning: true };
  var status = syncStatus_();
  if (status.ok && status.run && status.run.status !== 'completed') return { ok: true, alreadyRunning: true, run: status.run };
  var res = ghFetch_(gh, '/actions/workflows/' + gh.workflow + '/dispatches', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ ref: gh.ref }),
  });
  if (res.getResponseCode() !== 204) return { ok: false, error: 'GitHub refused to start the update (HTTP ' + res.getResponseCode() + '). Check the token permission "Actions: Read and write".' };
  cache.put('syncStarted', '1', 90);
  return { ok: true, started: true };
}
