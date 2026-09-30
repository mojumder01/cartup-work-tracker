import type { CellValue } from '../types';

export type ExportRow = CellValue[];

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: CellValue): string => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Neutralise spreadsheet formula injection when the CSV is opened in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(fileName: string, headers: string[], rows: ExportRow[]) {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  // BOM so Excel opens UTF-8 (Bangla names etc.) correctly.
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), fileName);
}

/** Real .xlsx export; the library is loaded only when someone exports. */
export async function exportXlsx(fileName: string, sheetName: string, headers: string[], rows: ExportRow[]) {
  const { default: writeXlsxFile } = await import('write-excel-file');
  const data = [
    headers.map((h) => ({ value: h, fontWeight: 'bold' as const })),
    ...rows.map((r) =>
      r.map((v) => (v === null || v === undefined || v === '' ? null : { value: typeof v === 'boolean' ? String(v) : v })),
    ),
  ];
  await writeXlsxFile(data as never, { fileName, sheet: sheetName.slice(0, 31), stickyRowsCount: 1 } as never);
}

export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
