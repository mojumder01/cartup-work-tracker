/**
 * Cartup — Google Sheets read/write service for the dashboard, Job desk and Task board.
 *
 * This script is deliberately small and general: the website asks it to READ rows or WRITE
 * cells, and the script enforces the safety rules. New website features therefore do NOT need
 * a new script version. (If it ever must change, GitHub Actions can redeploy it automatically —
 * see README "Apps Script auto-deploy".)
 *
 * Safety rules enforced here, whatever the website sends:
 *  - Only the sheets listed in SHEETS, and only writable columns (Work Sheet: WORK_WRITABLE, or the
 *    Script Property WRITABLE_WORK = "Col A, Col B, …" to change the list without redeploying).
 *  - Login / password / phone / mail columns are never read or written.
 *  - Formula columns (incl. ARRAYFORMULA) are never overwritten.
 *  - "expect": if a cell changed after the person loaded it, nothing is written for that row.
 *  - Every Work Sheet change is logged in the "Form Log" tab (time, JOB ID, who, field, old → new).
 *  - Text starting with = + - @ is stored as text (no formula injection).
 *
 * Setup (once): paste this file into an Apps Script project (any project opened with the sheet
 * owner's account), Save, run `setup`, then Deploy → New deployment → Web app → Execute as: Me ·
 * Who has access: Anyone. Later changes: Deploy → Manage deployments → ✏️ → Version: New version.
 *
 * Optional — "Update data" button: Project Settings → Script Properties →
 *   GITHUB_TOKEN = fine-grained token (only this repo, "Actions: Read and write"), GITHUB_REPO = owner/repo.
 */

var SCRIPT_VERSION = '2.1.5';

var WORK_ID = '1H35eZz06Wx4uGcFXxZjwQQ1F1M5T8qU3gi8fY2gvaXc';
var GOVERNANCE_ID = '1Bw1lfwvEJfFOx_1HFifPqdr6KoG9XQ8rAJiNAboN5T4';
/** "Cartup Work Tracker Content/Commercial" — Work Sheet changes can be copied to its "Uplaod Responses Form" tab. */
var COMMERCIAL_ID = '1uwPpC9Ut81iRWF_sSzYimzozugy4S6xiw-x5rVM1kJk';

/**
 * Work Sheet column → Content/Commercial column, used when a change is sent with mirror:true.
 * Override without redeploying: Script Property COMMERCIAL_MAP = {"Status":"Upload Status", …} (JSON).
 */
var COMMERCIAL_MAP = {
  'Number of SKU': 'Number of SKU',
  'Uploaded SKU Count': 'Uploaded SKU Count',
  'Status': 'Upload Status',
  'Comments': 'Catalogue Comment', // written as "<Rejected SKU Count> rejected. <Comments>"
  'Rejected QC Count': 'Rejected QC Count',
  'Approved QC Count': 'Approved QC Count',
  'Upload date': 'Upload Date',
  'QC approved date': 'QC Date',
  'QC Status': 'QC Status',
};
/** JOB ID column of the Content/Commercial tab when its header is not "JOB ID" (Script Property COMMERCIAL_JOB_COL overrides). */
var COMMERCIAL_JOB_COL = 'S';

var WORK_WRITABLE = ['Status', 'Uploaded SKU Count', 'Rejected SKU Count', 'Upload date', 'Upload Month', 'Comments', 'Uploaded by',
  'Visual editor', 'Image Status', 'Image count', 'Edited (By Hand)', 'Edited (By AI)', 'Image Delivered Date',
  'QC By', 'QC Status', 'Approved QC Count', 'Rejected QC Count', 'QC approved date'];

/**
 * name → where it lives and what may be done with it.
 * managed: the script may create the tab and add missing header cells (the website's own tabs).
 */
var SHEETS = {
  work: { id: WORK_ID, tab: 'Work Sheet', key: 'JOB ID', writable: WORK_WRITABLE, log: true },
  log: { id: WORK_ID, tab: 'Form Log', key: 'JOB ID', writable: [] },
  projects: { id: GOVERNANCE_ID, tab: 'Projects', key: 'Project ID', writable: '*', managed: true, append: true },
  progress: { id: GOVERNANCE_ID, tab: 'Project Progress', key: 'Log ID', writable: '*', managed: true, append: true, remove: true },
  commercial: { id: COMMERCIAL_ID, tab: 'Uplaod Responses Form', key: 'Timestamp', writable: [] },
};
var FORM_LOG_HEADERS = ['Timestamp', 'JOB ID', 'Submitted By', 'Field', 'Old Value', 'New Value'];
var SECRET = /password|passcode|login\s*id|secret|token|phone|mail/i;

/** Run once from the editor (authorises the script and creates the website's own tabs). */
function setup() {
  var out = [];
  ['projects', 'progress'].forEach(function (n) { out.push(n + ': ' + tab_(SHEETS[n], true).getName()); });
  out.push('work: ' + tab_(SHEETS.work, false).getName());
  return 'Ready — ' + out.join(', ');
}

// ---- small helpers ----------------------------------------------------------

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function account_() {
  try { return Session.getEffectiveUser().getEmail() || "this script's account"; } catch (e) { return "this script's account"; }
}
/** The spreadsheet's own time zone (dates are created / shown in it, whatever the script project's zone is). */
function tzOf_(sh) {
  try { return sh.getParent().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); } catch (e) { return Session.getScriptTimeZone(); }
}
function norm_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return out_(v, tz || Session.getScriptTimeZone());
  return v === null || v === undefined ? '' : String(v).trim();
}
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
function out_(v, tz) {
  if (isDate_(v)) {
    var hasTime = Utilities.formatDate(v, tz, 'HH:mm:ss') !== '00:00:00';
    return Utilities.formatDate(v, tz, hasTime ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd');
  }
  return v === '' ? null : v;
}
function str_(v, max) {
  var s = v === null || v === undefined ? '' : String(v).trim();
  if (s.length > (max || 2000)) s = s.slice(0, max || 2000);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
/** "yyyy-MM-dd" → midnight of that day in the sheet's time zone (so the sheet shows exactly that day). */
function day_(y, m, d, tz) {
  var iso = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
  if (tz && Utilities.parseDate) return Utilities.parseDate(iso, tz, 'yyyy-MM-dd');
  return new Date(y, m - 1, d);
}
/** Website value → cell value: {date:'yyyy-mm-dd'}, {month:'yyyy-mm'}, {now:true}, number, text. */
function in_(v, now, tz) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    if (!isFinite(v) || Math.abs(v) > 1e12) throw new Error('Invalid number');
    return v;
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') {
    if (v.now) return now;
    var m = String(v.date || v.month || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!m) throw new Error('Invalid date');
    return day_(Number(m[1]), Number(m[2]), v.month ? 1 : Number(m[3] || 1), tz);
  }
  return str_(v);
}
function prop_(name) {
  try { return PropertiesService.getScriptProperties().getProperty(name); } catch (e) { return null; }
}
function writable_(name, cfg) {
  var custom = prop_('WRITABLE_' + name.toUpperCase());
  if (custom) return custom.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
  return cfg.writable === '*' ? '*' : cfg.writable.map(function (s) { return s.toLowerCase(); });
}

// ---- sheets -------------------------------------------------------------------

function noAccess_(cfg) {
  return new Error('The Apps Script runs as ' + account_() + ', and that account cannot open the sheet with the "' + cfg.tab +
    '" tab. Open that Google Sheet → Share → add ' + account_() + ' as Editor (by email, not only "anyone with the link").');
}
function tab_(cfg, create) {
  var ss;
  var sh;
  var want = cfg.tab.toLowerCase().replace(/\s+/g, ' ').trim();
  try {
    ss = SpreadsheetApp.openById(cfg.id);
    sh = ss.getSheetByName(cfg.tab) ||
      ss.getSheets().filter(function (x) { return x.getName().toLowerCase().replace(/\s+/g, ' ').trim() === want; })[0] || null;
  } catch (e) {
    throw noAccess_(cfg);
  }
  if (!sh && create) sh = ss.insertSheet(cfg.tab);
  if (!sh) throw new Error('Tab "' + cfg.tab + '" not found.');
  return sh;
}

/** Header row (the row in the first 10 that holds the key column; row 1 for new tabs) and column lookup. */
function layout_(sh, cfg) {
  var width = Math.max(sh.getLastColumn(), 1);
  var top = sh.getRange(1, 1, Math.max(1, Math.min(10, sh.getLastRow())), width).getValues();
  var headerRow = 1;
  for (var r = 0; r < top.length; r++) {
    if (top[r].some(function (h) { return String(h).trim().toLowerCase() === cfg.key.toLowerCase(); })) { headerRow = r + 1; break; }
  }
  var L = { sh: sh, cfg: cfg, headerRow: headerRow, headers: [], width: width, tz: tzOf_(sh) };
  L.headers = sh.getRange(headerRow, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
  L.col = function (name) {
    var n = String(name).toLowerCase();
    for (var i = 0; i < L.headers.length; i++) if (L.headers[i].toLowerCase() === n) return i + 1;
    return 0;
  };
  return L;
}

/** Managed tabs only: add missing header cells after the last header. */
function ensureCols_(L, names) {
  if (!L.cfg.managed) return;
  var missing = names.filter(function (n) { return n && !L.col(n) && !SECRET.test(n); });
  if (!missing.length) return;
  var used = 0;
  L.headers.forEach(function (h, i) { if (h) used = i + 1; });
  L.sh.getRange(L.headerRow, used + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  if (L.sh.getFrozenRows() === 0) L.sh.setFrozenRows(L.headerRow);
  L.headers = L.headers.slice(0, used).concat(missing);
  L.width = Math.max(L.width, L.headers.length);
}

function findRow_(L, key) {
  var c = L.col(L.cfg.key);
  var last = L.sh.getLastRow();
  if (!c || last <= L.headerRow) return -1;
  var hit = L.sh.getRange(L.headerRow + 1, c, last - L.headerRow, 1).createTextFinder(String(key)).matchEntireCell(true).matchCase(false).findNext();
  return hit ? hit.getRow() : -1;
}

function isFormula_(L, row, c) {
  if (L.sh.getRange(row, c).getFormula()) return true;
  return L.sh.getRange(1, c, L.headerRow + 1, 1).getFormulas().some(function (f) { return /ARRAYFORMULA|MAP\(|BYROW\(/i.test(f[0]); });
}

// ---- READ -------------------------------------------------------------------------

/**
 * GET ?action=read&sheet=work&cols=A,B,…  plus one of
 *   &key=CCWT100                         exact key match (also returns `locked`: writable columns calculated by formulas)
 *   &q=text&in=Col1|Col2                 contains search
 *   &notIn=Status:Done|Rejected&recent=Timestamp|Upload date:30   unfinished OR recent rows
 *   &need=Task Type|Shop Name            skip rows where all of these are empty
 *   &order=desc|asc  &limit=500
 * → { ok, columns, rows: [[…]], total, locked? }
 */
function read_(p) {
  var name = String(p.sheet || '');
  var cfg = SHEETS[name];
  if (!cfg) throw new Error('Unknown sheet "' + name + '"');
  var sh = tab_(cfg, !!cfg.managed);
  var L = layout_(sh, cfg);
  var tz = L.tz;
  var cols = (p.cols ? String(p.cols).split(',') : L.headers).map(function (s) { return String(s).trim(); })
    .filter(function (s) { return s && !SECRET.test(s); });
  var idx = cols.map(function (c) { return L.col(c) - 1; });
  var last = sh.getLastRow();
  var res = { ok: true, sheet: name, columns: cols, rows: [], total: 0 };
  if (last <= L.headerRow) return res;
  var limit = Math.min(Math.max(Number(p.limit) || 3000, 1), 5000);

  if (p.key) {
    var row = findRow_(L, String(p.key).trim());
    if (row < 0) return res;
    var vals = sh.getRange(row, 1, 1, L.width).getValues()[0];
    res.rows = [idx.map(function (k) { return k >= 0 ? out_(vals[k], tz) : null; })];
    res.total = 1;
    var w = writable_(name, cfg);
    res.locked = (w === '*' ? cols : cols.filter(function (c) { return w.indexOf(c.toLowerCase()) >= 0; }))
      .filter(function (c) { var k = L.col(c); return !k || isFormula_(L, row, k); });
    return res;
  }

  var data = sh.getRange(L.headerRow + 1, 1, last - L.headerRow, L.width).getValues();
  var keyC = L.col(cfg.key) - 1;
  var colsOf = function (s) { return String(s || '').split('|').map(function (x) { return L.col(x.trim()) - 1; }).filter(function (k) { return k >= 0; }); };
  var q = String(p.q || '').trim().toLowerCase();
  var qCols = p['in'] ? colsOf(p['in']) : [keyC];
  var need = p.need ? colsOf(p.need) : [];
  var notIn = null;
  if (p.notIn) {
    var parts = String(p.notIn).split(':');
    notIn = { c: L.col(parts[0]) - 1, vals: (parts[1] || '').split('|').map(function (x) { return x.trim().toLowerCase(); }) };
  }
  var recent = null;
  if (p.recent) {
    var rp = String(p.recent).split(':');
    recent = { cs: colsOf(rp[0]), since: new Date().getTime() - Math.min(Math.max(Number(rp[1]) || 30, 1), 3650) * 86400000 };
  }
  var order = p.order === 'asc' ? 1 : -1;
  for (var n = 0; n < data.length; n++) {
    var r = data[order === 1 ? n : data.length - 1 - n];
    if (keyC >= 0 && !norm_(r[keyC], tz)) continue;
    if (need.length && !need.some(function (k) { return norm_(r[k], tz) !== ''; })) continue;
    if (q && !qCols.some(function (k) { return norm_(r[k], tz).toLowerCase().indexOf(q) >= 0; })) continue;
    if (notIn || recent) {
      var a = notIn && notIn.c >= 0 && notIn.vals.indexOf(norm_(r[notIn.c], tz).toLowerCase()) < 0;
      var b = recent && recent.cs.some(function (k) { return isDate_(r[k]) && r[k].getTime() >= recent.since; });
      if (!a && !b) continue;
    }
    res.total++;
    if (res.rows.length < limit) res.rows.push(idx.map(function (k) { return k >= 0 ? out_(r[k], tz) : null; }));
  }
  return res;
}

// ---- MIRROR (Work Sheet → Content/Commercial) -------------------------------------------

function commercialMap_() {
  var custom = prop_('COMMERCIAL_MAP');
  if (custom) { try { return JSON.parse(custom); } catch (e) { /* fall back */ } }
  return COMMERCIAL_MAP;
}

/**
 * Brings the matching Content/Commercial row in line with a Work Sheet row: every mapped
 * column that has a value in the Work Sheet (after this save) is copied; empty Work Sheet
 * cells never clear the other sheet. Returns { ok, written, skipped, reason? }. Never throws.
 */
function mirror_(W, row, cache) {
  try {
    var map = commercialMap_();
    var C = cache.L || (cache.L = layout_(tab_(SHEETS.commercial, false), SHEETS.commercial));
    var src = W.sh.getRange(row, 1, 1, W.width).getValues()[0];
    var srcOf = function (name) { var c = W.col(name); return c ? src[c - 1] : null; };
    var values = {};
    Object.keys(map).forEach(function (f) {
      var v = srcOf(f);
      if (v === null || norm_(v, W.tz) === '') return;
      // A date (no time) is copied as the same calendar day in the other sheet's time zone.
      if (isDate_(v) && Utilities.formatDate(v, W.tz, 'HH:mm:ss') === '00:00:00') {
        var p = Utilities.formatDate(v, W.tz, 'yyyy-MM-dd').split('-');
        v = day_(Number(p[0]), Number(p[1]), Number(p[2]), C.tz);
      }
      values[f] = v;
    });
    // Catalogue Comment = Rejected SKU Count + Comments, like "89 rejected. (name & image missing)".
    if (map['Comments']) {
      var rej = Number(srcOf('Rejected SKU Count')) || 0;
      var note = norm_(srcOf('Comments'), W.tz).replace(/\s*\n\s*/g, '; ');
      var merged = [rej > 0 ? rej + ' rejected.' : '', note].filter(String).join(' ');
      if (merged) values['Comments'] = merged;
    }
    var fields = Object.keys(values);
    if (!fields.length) return { ok: true, written: [], skipped: [], reason: 'nothing to copy' };
    var last = C.sh.getLastRow();
    if (last <= C.headerRow) return { ok: false, written: [], skipped: [], reason: 'the Content/Commercial tab is empty' };

    // Find the row by JOB ID (column "JOB ID", else COMMERCIAL_JOB_COL = S) and copy the data there.
    var target = -1;
    var letter = String(prop_('COMMERCIAL_JOB_COL') || COMMERCIAL_JOB_COL).toUpperCase();
    var jobCol = C.col('JOB ID') || (/^[A-Z]{1,2}$/.test(letter) ? letter.split('').reduce(function (z, ch) { return z * 26 + ch.charCodeAt(0) - 64; }, 0) : 0);
    var id = norm_(srcOf('JOB ID'), W.tz);
    if (!jobCol || !id) return { ok: false, written: [], skipped: [], reason: 'no JOB ID to look up' };
    var hit = C.sh.getRange(C.headerRow + 1, jobCol, last - C.headerRow, 1).createTextFinder(id).matchEntireCell(true).matchCase(false).findNext();
    if (hit) target = hit.getRow();
    if (target < 0) return { ok: false, written: [], skipped: [], reason: 'JOB ID ' + id + ' not found in the Content/Commercial tab' };

    var written = [];
    var skipped = [];
    fields.forEach(function (f) {
      var name = map[f];
      var c = C.col(name);
      if (!c || SECRET.test(name)) { skipped.push({ field: name, reason: 'column not found' }); return; }
      if (isFormula_(C, target, c)) { skipped.push({ field: name, reason: 'calculated by the sheet' }); return; }
      var cell = C.sh.getRange(target, c);
      if (norm_(cell.getValue(), C.tz) === norm_(values[f], C.tz)) return;
      cell.setValue(values[f]);
      written.push(name);
    });
    return { ok: true, row: target, written: written, skipped: skipped };
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    // Google's own text is in the account's language (e.g. "…অনুমতি নেই"); say it plainly instead.
    if (/permission|access|denied|অনুমতি|অ্যাক্সেস/i.test(msg) && msg.indexOf('Share') < 0) msg = noAccess_(SHEETS.commercial).message;
    return { ok: false, written: [], skipped: [], reason: msg };
  }
}

// ---- WRITE ------------------------------------------------------------------------

/**
 * POST { action:'write', by:'Name', ops:[
 *   { sheet:'work', op:'update', key:'CCWT100', set:{ Status:'Done', 'Upload date':{date:'2026-10-01'} }, expect:{ Status:'Running' } },
 *   { sheet:'projects', op:'append', set:{ 'Project ID':'PRJ-…', … } },
 *   { sheet:'progress', op:'delete', key:'LOG-…' } ] }
 * Work Sheet updates with mirror:true also copy the changed cells to the Content/Commercial tab (COMMERCIAL_MAP).
 * → { ok, results:[{ ok, key, written:[…], skipped:[{field, reason}], reason?, duplicate?, mirror? }] }
 */
function write_(body, nowDate) {
  var by = str_(body.by, 60);
  if (!by) throw new Error('Your name is required.');
  var ops = [].concat(body.ops || []);
  if (!ops.length || ops.length > 200) throw new Error('Send 1–200 changes at a time.');
  var layouts = {};
  var mirrorCache = {};
  var logRows = [];
  var nowAt = function (tz) { return Utilities.formatDate(nowDate, tz, "yyyy-MM-dd'T'HH:mm:ss"); };
  var results = ops.map(function (o) {
    var key = String((o && o.key) || '').trim();
    try {
      var name = String(o.sheet || '');
      var cfg = SHEETS[name];
      if (!cfg) throw new Error('Unknown sheet "' + name + '"');
      var L = layouts[name] || (layouts[name] = layout_(tab_(cfg, !!cfg.managed), cfg));
      var allowed = writable_(name, cfg);
      var canWrite = function (c) { return !SECRET.test(c) && (allowed === '*' || allowed.indexOf(c.toLowerCase()) >= 0); };
      var set = o.set || {};

      if (o.op === 'append') {
        if (!cfg.append) throw new Error('Adding rows is not allowed here');
        key = String(set[cfg.key] || '').trim();
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,60}$/.test(key)) throw new Error('Invalid ' + cfg.key);
        if (findRow_(L, key) > 0) return { ok: true, key: key, duplicate: true, written: [], skipped: [] };
        var fields = Object.keys(set).filter(canWrite);
        ensureCols_(L, fields);
        var rowVals = [];
        for (var i = 0; i < L.headers.length; i++) rowVals.push('');
        fields.forEach(function (f) { var c = L.col(f); if (c) rowVals[c - 1] = in_(set[f], nowAt(L.tz), L.tz); });
        L.sh.getRange(L.sh.getLastRow() + 1, 1, 1, rowVals.length).setValues([rowVals]);
        return { ok: true, key: key, written: fields, skipped: [] };
      }

      if (!key) throw new Error('Missing ' + cfg.key);
      var row = findRow_(L, key);
      if (row < 0) return { ok: false, key: key, reason: 'not found in "' + cfg.tab + '"' };

      if (o.op === 'delete') {
        if (!cfg.remove) throw new Error('Deleting rows is not allowed here');
        L.sh.deleteRow(row);
        return { ok: true, key: key, written: ['(row deleted)'], skipped: [] };
      }
      if (o.op !== 'update') throw new Error('Unknown op');

      // Freshness: refuse the whole row if anything the person saw has changed since.
      var stale = [];
      Object.keys(o.expect || {}).forEach(function (f) {
        var c = L.col(f);
        if (!c || SECRET.test(f)) return;
        var cur = norm_(L.sh.getRange(row, c).getValue(), L.tz);
        if (cur !== norm_(o.expect[f], L.tz)) stale.push(f + ' is now "' + (cur || 'empty') + '"');
      });
      if (stale.length) return { ok: false, key: key, stale: true, reason: 'changed by someone else since you loaded it (' + stale.join('; ') + ')' };

      var written = [];
      var skipped = [];
      ensureCols_(L, Object.keys(set).filter(canWrite));
      Object.keys(set).forEach(function (f) {
        if (!canWrite(f)) { skipped.push({ field: f, reason: 'not editable' }); return; }
        var c = L.col(f);
        if (!c) { skipped.push({ field: f, reason: 'column not found' }); return; }
        if (isFormula_(L, row, c)) { skipped.push({ field: f, reason: 'calculated by the sheet' }); return; }
        var cell = L.sh.getRange(row, c);
        var old = norm_(cell.getValue(), L.tz);
        var val = in_(set[f], nowAt(L.tz), L.tz);
        if (old === norm_(val, L.tz)) return;
        cell.setValue(val);
        written.push(f);
        if (cfg.log) logRows.push([nowAt(L.tz), key, by, f, old, isDate_(val) ? out_(val, L.tz) : String(val)]);
      });
      var res = { ok: true, key: key, written: written, skipped: skipped };
      if (o.mirror && name === 'work') {
        res.mirror = mirror_(L, row, mirrorCache);
        (res.mirror.written || []).forEach(function (f) { logRows.push([nowAt(L.tz), key, by, 'Content/Commercial → ' + f, '', 'copied from Work Sheet']); });
      }
      return res;
    } catch (err) {
      return { ok: false, key: key, reason: String(err && err.message ? err.message : err) };
    }
  });
  if (logRows.length) {
    var lg = tab_(SHEETS.log, true);
    if (!String(lg.getRange(1, 1).getValue())) lg.getRange(1, 1, 1, FORM_LOG_HEADERS.length).setValues([FORM_LOG_HEADERS]).setFontWeight('bold');
    lg.getRange(lg.getLastRow() + 1, 1, logRows.length, FORM_LOG_HEADERS.length).setValues(logRows);
  }
  return { ok: true, results: results };
}

// ---- entry points -------------------------------------------------------------------

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = p.action || 'ping';
    if (action === 'ping') {
      var check = function (cfg) { try { tab_(cfg, false); return null; } catch (err) { return String(err.message || err); } };
      var workErr = check(SHEETS.work);
      var comErr = check(SHEETS.commercial);
      var govErr = (function () { try { SpreadsheetApp.openById(GOVERNANCE_ID); return null; } catch (err) { return 'The Apps Script runs as ' + account_() + ', and that account cannot open the Governance sheet. Share it with ' + account_() + ' as Editor.'; } })();
      return json_({ ok: true, version: SCRIPT_VERSION, account: account_(), sync: !!github_(),
        work: !workErr, workError: workErr, sheet: !govErr, sheetError: govErr, commercial: !comErr, commercialError: comErr });
    }
    if (action === 'read') return json_(read_(p));
    if (action === 'syncStatus') return json_(syncStatus_());
    throw new Error('Unknown action "' + action + '"');
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'write') return json_(write_(body, new Date()));
    if (body.action === 'triggerSync') return json_(triggerSync_());
    throw new Error('Unknown action');
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

// ---- "Update data" button: start the GitHub Action ------------------------------------

function github_() {
  var token = prop_('GITHUB_TOKEN');
  var repo = prop_('GITHUB_REPO');
  if (!token || !repo) return null;
  return { token: token, repo: repo, workflow: prop_('GITHUB_WORKFLOW') || 'deploy.yml', ref: prop_('GITHUB_REF') || 'main' };
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
