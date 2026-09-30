/**
 * Cartup Governance — REVAMP project assign API.
 *
 * Paste this file into the Governance spreadsheet:
 *   Extensions → Apps Script → replace Code.gs → Save.
 * Then run `setup` once (authorise when asked) and deploy:
 *   Deploy → New deployment → type "Web app" →
 *   Execute as: Me · Who has access: Anyone → Deploy → copy the Web app URL.
 * Put that URL in GitHub: Settings → Secrets and variables → Actions →
 *   Variables → New repository variable GOVERNANCE_APPS_SCRIPT_URL.
 *
 * The script only touches two tabs it creates itself: "Projects" and
 * "Project Progress". The "Main" Ad-Hoc tab is never modified.
 */

var PROJECTS_TAB = 'Projects';
var PROGRESS_TAB = 'Project Progress';
var PROJECT_HEADERS = ['Project ID', 'Created At', 'Project Name', 'Work Type', 'Description', 'POC', 'Assignees',
  'Total SKUs', 'Start Date', 'Due Date', 'Status', 'Priority', 'Found Label', 'Updated At', 'Updated By'];
var PROGRESS_HEADERS = ['Log ID', 'Timestamp', 'Project ID', 'Date', 'Person', 'Reviewed', 'Found', 'Updated', 'Note'];
var STATUSES = ['Planned', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
var PRIORITIES = ['High', 'Medium', 'Low'];
var EDITABLE = ['Project Name', 'Work Type', 'Description', 'POC', 'Assignees', 'Total SKUs', 'Start Date', 'Due Date',
  'Status', 'Priority', 'Found Label'];

/** Run once from the editor: creates the two tabs with headers. */
function setup() {
  sheet_(PROJECTS_TAB, PROJECT_HEADERS);
  sheet_(PROGRESS_TAB, PROGRESS_HEADERS);
  return 'Ready';
}

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Rows as objects keyed by header; dates as yyyy-mm-dd / ISO strings. */
function readTab_(name, headers) {
  var sh = sheet_(name, headers);
  var values = sh.getDataRange().getValues();
  var head = values.shift() || [];
  var tz = Session.getScriptTimeZone();
  return values.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) {
      var v = r[i];
      if (v instanceof Date) {
        v = /At$|Timestamp/.test(h) ? Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ss") : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      }
      o[h] = v === '' ? null : v;
    });
    return o;
  });
}

/** GET ?action=list → { ok, projects, progress } (live data, no waiting for the sync). */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'list';
  if (action === 'ping') return json_({ ok: true });
  return json_({ ok: true, projects: readTab_(PROJECTS_TAB, PROJECT_HEADERS), progress: readTab_(PROGRESS_TAB, PROGRESS_HEADERS) });
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

function projectRow_(p, existing) {
  var row = existing ? existing.slice() : PROJECT_HEADERS.map(function () { return ''; });
  var set = function (h, v) { row[PROJECT_HEADERS.indexOf(h)] = v; };
  if (p['Project Name'] !== undefined) set('Project Name', str_(p['Project Name'], 120));
  if (p['Work Type'] !== undefined) set('Work Type', str_(p['Work Type'], 80));
  if (p['Description'] !== undefined) set('Description', str_(p['Description'], 1000));
  if (p['POC'] !== undefined) set('POC', str_(p['POC'], 60));
  if (p['Assignees'] !== undefined) set('Assignees', str_([].concat(p['Assignees']).join(', '), 500));
  if (p['Total SKUs'] !== undefined) set('Total SKUs', num_(p['Total SKUs']));
  if (p['Start Date'] !== undefined) set('Start Date', day_(p['Start Date']));
  if (p['Due Date'] !== undefined) set('Due Date', day_(p['Due Date']));
  if (p['Status'] !== undefined) set('Status', oneOf_(p['Status'], STATUSES, 'Planned'));
  if (p['Priority'] !== undefined) set('Priority', oneOf_(p['Priority'], PRIORITIES, 'Medium'));
  if (p['Found Label'] !== undefined) set('Found Label', str_(p['Found Label'], 60));
  return row;
}

/**
 * POST body (sent as text/plain JSON):
 *   { action: 'createProject', project: {...}, by: 'Name' }
 *   { action: 'updateProject', id: 'PRJ-…', changes: {...}, by: 'Name' }
 *   { action: 'logProgress', log: {...} }
 *   { action: 'deleteLog', id: 'LOG-…' }
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var tz = Session.getScriptTimeZone();
    var now = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss");

    if (body.action === 'createProject') {
      var p = body.project || {};
      if (!str_(p['Project Name'])) throw new Error('Project name is required');
      var sh = sheet_(PROJECTS_TAB, PROJECT_HEADERS);
      var row = projectRow_(p, null);
      row[0] = id_(p['Project ID'], 'PRJ');
      row[1] = now;
      if (!row[PROJECT_HEADERS.indexOf('Status')]) row[PROJECT_HEADERS.indexOf('Status')] = 'Planned';
      row[PROJECT_HEADERS.indexOf('Updated At')] = now;
      row[PROJECT_HEADERS.indexOf('Updated By')] = str_(body.by, 60);
      var ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return r[0]; });
      if (ids.indexOf(row[0]) >= 0) return json_({ ok: true, id: row[0], duplicate: true });
      sh.appendRow(row);
      return json_({ ok: true, id: row[0] });
    }

    if (body.action === 'updateProject') {
      var id = id_(body.id, 'PRJ');
      var sh2 = sheet_(PROJECTS_TAB, PROJECT_HEADERS);
      var data = sh2.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === id) {
          var changes = {};
          EDITABLE.forEach(function (k) { if (body.changes && body.changes[k] !== undefined) changes[k] = body.changes[k]; });
          var updated = projectRow_(changes, data[i]);
          updated[PROJECT_HEADERS.indexOf('Updated At')] = now;
          updated[PROJECT_HEADERS.indexOf('Updated By')] = str_(body.by, 60);
          sh2.getRange(i + 1, 1, 1, updated.length).setValues([updated]);
          return json_({ ok: true, id: id });
        }
      }
      throw new Error('Project not found');
    }

    if (body.action === 'logProgress') {
      var l = body.log || {};
      var sh3 = sheet_(PROGRESS_TAB, PROGRESS_HEADERS);
      var logId = id_(l['Log ID'], 'LOG');
      var existing = sh3.getRange(1, 1, sh3.getLastRow(), 1).getValues().map(function (r) { return r[0]; });
      if (existing.indexOf(logId) >= 0) return json_({ ok: true, id: logId, duplicate: true });
      sh3.appendRow([
        logId, now, id_(l['Project ID'], 'PRJ'), day_(l['Date']) || now.slice(0, 10), str_(l['Person'], 60),
        num_(l['Reviewed']) || 0, num_(l['Found']) || 0, num_(l['Updated']) || 0, str_(l['Note'], 500),
      ]);
      return json_({ ok: true, id: logId });
    }

    if (body.action === 'deleteLog') {
      var delId = id_(body.id, 'LOG');
      var sh4 = sheet_(PROGRESS_TAB, PROGRESS_HEADERS);
      var d = sh4.getDataRange().getValues();
      for (var j = d.length - 1; j >= 1; j--) {
        if (d[j][0] === delId) {
          sh4.deleteRow(j + 1);
          return json_({ ok: true, id: delId });
        }
      }
      throw new Error('Log not found');
    }

    throw new Error('Unknown action');
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}
