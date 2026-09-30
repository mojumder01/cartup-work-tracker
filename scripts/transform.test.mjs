// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { serialToIso, findHeaderRow, normalizeHeaders, transformWorkSheet, tidyGrid } from './lib/transform.mjs';
import { buildAssertion, parseServiceAccount, DataSourceError, normalizeKeyText } from './lib/google-auth.mjs';
import { quoteTab } from './lib/sheets-api.mjs';
import { extractSheetId } from './fetch-sheets.mjs';

test('serialToIso converts dates and date-times', () => {
  assert.equal(serialToIso(46295), '2026-09-30');
  assert.equal(serialToIso(46295.5), '2026-09-30T12:00:00');
  assert.equal(serialToIso(45635.58298), '2024-12-09T13:59:29');
  assert.equal(serialToIso('text'), 'text');
});

test('findHeaderRow picks the row that matches expected columns', () => {
  const grid = [['Report'], [], ['JOB ID', 'Timestamp', 'Status'], ['CCWT1', 1, 'Done']];
  assert.equal(findHeaderRow(grid, ['JOB ID', 'Status']), 2);
  assert.equal(findHeaderRow([[], ['a', 'b']], []), 1);
});

test('normalizeHeaders fills blanks and de-duplicates', () => {
  assert.deepEqual(normalizeHeaders(['A', '', 'A'], 4), ['A', 'Column B', 'A (2)', 'Column D']);
});

test('transformWorkSheet excludes secret columns, converts dates, drops empty rows', () => {
  const grid = [
    ['JOB ID', 'Timestamp', 'Seller Login Password', 'Upload date', 'Status'],
    ['CCWT1', 46295.25, 'secret', 46295, ' Done '],
    ['', '', '', '', ''],
    ['CCWT2'],
  ];
  const { table, warnings } = transformWorkSheet(grid, {
    expectedColumns: ['JOB ID', 'Status', 'QC By'],
    excludeColumns: ['Seller Login Password'],
    dateColumns: ['Timestamp'],
  });
  assert.deepEqual(table.columns, ['JOB ID', 'Timestamp', 'Upload date', 'Status']);
  assert.deepEqual(table.rows, [
    ['CCWT1', '2026-09-30T06:00:00', '2026-09-30', 'Done'],
    ['CCWT2', null, null, null],
  ]);
  assert.ok(!JSON.stringify(table).includes('secret'));
  assert.match(warnings[0], /QC By/);
});

test('tidyGrid trims trailing empty rows', () => {
  assert.deepEqual(tidyGrid([['a', ''], [], ['', null]]), [['a', null]]);
});

test('service-account parsing and JWT signing', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const raw = JSON.stringify({ type: 'service_account', client_email: 'x@y.iam.gserviceaccount.com', private_key: pem });
  const sa = parseServiceAccount(Buffer.from(raw).toString('base64'));
  const jwt = buildAssertion(sa, 1000);
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.iss, 'x@y.iam.gserviceaccount.com');
  assert.equal(claims.exp, 4600);
  const verify = createVerify('RSA-SHA256');
  verify.update(`${h}.${c}`);
  assert.ok(verify.verify(publicKey, Buffer.from(s, 'base64url')));
  assert.throws(() => parseServiceAccount(''), DataSourceError);
  assert.throws(() => parseServiceAccount('{"type":"user"}'), DataSourceError);
});

test('helpers', () => {
  assert.equal(quoteTab("KPI & Target"), "'KPI & Target'");
  assert.equal(quoteTab("Bob's"), "'Bob''s'");
  assert.equal(
    extractSheetId('https://docs.google.com/spreadsheets/d/1H35eZz06Wx4uGcFXxZjwQQ1F1M5T8qU3gi8fY2gvaXc/edit?gid=0#gid=0'),
    '1H35eZz06Wx4uGcFXxZjwQQ1F1M5T8qU3gi8fY2gvaXc',
  );
});

test('transformWorkSheet includeColumns keeps only listed columns', () => {
  const grid = [
    ['Timestamp', 'Shop Name', 'QC By', 'Number of SKUs', 'QC Date'],
    [46283.5, 'Shop', 'Jerry', 7, 46283],
  ];
  const { table } = transformWorkSheet(grid, {
    expectedColumns: ['QC By', 'Number of SKUs', 'QC Date'],
    includeColumns: ['QC By', 'Number of SKUs', 'QC Date'],
    label: 'Admin portal QC import data',
  });
  assert.deepEqual(table.columns, ['QC By', 'Number of SKUs', 'QC Date']);
  assert.deepEqual(table.rows, [['Jerry', 7, '2026-09-18']]);
});

test('service-account key pasted without braces is accepted', () => {
  const inner = '"type": "service_account",\n  "client_email": "a@b.iam.gserviceaccount.com",\n  "private_key": "k"';
  assert.equal(JSON.parse(normalizeKeyText(inner)).type, 'service_account');
  assert.equal(JSON.parse(normalizeKeyText(`{${inner}`)).type, 'service_account');
  assert.equal(JSON.parse(normalizeKeyText(`${inner}\n}`)).type, 'service_account');
  assert.equal(JSON.parse(normalizeKeyText(Buffer.from(`{${inner}}`).toString('base64'))).type, 'service_account');
});
