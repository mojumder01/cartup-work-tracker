import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { dashboardConfig, C } from '../config/dashboard.config';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { CellValue, Dataset, WorkRecord } from '../types';
import { fmtDate, fmtNum } from '../utils/format';
import { isBlank, text, toNumber } from '../utils/parse';
import { statusColor } from '../charts/palette';
import { Icon } from './Icon';
import { EmptyState } from './ui';

const PAGE_SIZES = [25, 50, 100, 200];
const STATUS_COLUMNS = new Set([C.status, C.qcStatus, C.imageStatus]);
const isUrl = (v: string) => /^https?:\/\//i.test(v);
const isDateColumn = (c: string) => dashboardConfig.dateBasisColumns.includes(c) || /date|timestamp/i.test(c);

function renderCell(column: string, record: WorkRecord) {
  const v = record.values[column];
  if (isBlank(v)) return <span className="muted">—</span>;
  if (isDateColumn(column) && record.dates[column] != null) {
    return fmtDate(record.dates[column], column === C.timestamp);
  }
  if (typeof v === 'number') return fmtNum(v);
  const s = String(v);
  if (isUrl(s)) {
    return (
      <a href={s} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        Open <Icon name="external" size={12} />
      </a>
    );
  }
  if (STATUS_COLUMNS.has(column)) {
    const tone = statusColor(s);
    const cls = tone.includes('good') ? 'good' : tone.includes('bad') ? 'bad' : tone.includes('series-4') ? 'warn' : '';
    return <span className={`badge ${cls}`}>{s}</span>;
  }
  return s.length > 40 ? <span className="cell-trunc" title={s}>{s}</span> : s;
}

function isNumericColumn(ds: Dataset, column: string) {
  if (isDateColumn(column)) return false;
  let seen = 0;
  let nums = 0;
  for (const r of ds.records) {
    const v = r.values[column];
    if (isBlank(v)) continue;
    seen++;
    if (toNumber(v) !== null) nums++;
    if (seen >= 200) break;
  }
  return seen > 0 && nums / seen > 0.8;
}

function compare(a: CellValue, b: CellValue, numeric: boolean): number {
  if (isBlank(a)) return isBlank(b) ? 0 : 1;
  if (isBlank(b)) return -1;
  if (numeric) return (toNumber(a) ?? 0) - (toNumber(b) ?? 0);
  return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' });
}

function ColumnPicker({ all, visible, onChange }: { all: string[]; visible: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const set = new Set(visible);
  return (
    <div className="popover-wrap" ref={ref}>
      <button type="button" className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="columns" size={14} /> Columns ({visible.length}/{all.length})
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Choose columns">
          <div className="popover-actions">
            <button type="button" className="btn btn-sm" onClick={() => onChange(all)}>
              All
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onChange(dashboardConfig.defaultTableColumns.filter((c) => all.includes(c)))}
            >
              Default
            </button>
          </div>
          {all.map((c) => (
            <label key={c}>
              <input
                type="checkbox"
                checked={set.has(c)}
                onChange={(e) => onChange(e.target.checked ? all.filter((x) => set.has(x) || x === c) : visible.filter((x) => x !== c))}
              />
              {c}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function RowDrawer({ record, columns, onClose }: { record: WorkRecord; columns: string[]; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Work record details">
        <div className="drawer-head">
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Work record
            </div>
            <h3>{text(record.values[C.jobId]) || `Row ${record.idx + 2}`}</h3>
          </div>
          <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="drawer-body">
          <dl className="kv">
            {columns.map((c) => (
              <div key={c} style={{ display: 'contents' }}>
                <dt>{c}</dt>
                <dd>{renderCell(c, record)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </>
  );
}

export function useVisibleColumns(ds: Dataset): [string[], (v: string[]) => void] {
  const defaults = useMemo(() => {
    const d = dashboardConfig.defaultTableColumns.filter((c) => ds.has(c));
    return d.length ? d : ds.columns.slice(0, 12);
  }, [ds]);
  const [stored, setStored] = useLocalStorage<string[] | null>('cartup.tableColumns', null);
  const visible = stored ? ds.columns.filter((c) => stored.includes(c)) : defaults;
  return [visible.length ? visible : defaults, setStored];
}

interface Props {
  dataset: Dataset;
  records: WorkRecord[];
  toolbar?: React.ReactNode;
}

export const WorkTable = memo(function WorkTable({ dataset, records, toolbar }: Props) {
  const [visible, setVisible] = useVisibleColumns(dataset);
  const [sort, setSort] = useState<{ column: string; dir: 1 | -1 } | null>({ column: C.timestamp, dir: -1 });
  const [pageSize, setPageSize] = useLocalStorage('cartup.pageSize', 50);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<WorkRecord | null>(null);

  const sorted = useMemo(() => {
    if (!sort || !dataset.has(sort.column)) return records;
    const numeric = isNumericColumn(dataset, sort.column);
    const isDate = isDateColumn(sort.column);
    return [...records].sort((a, b) => {
      if (isDate) {
        const x = a.dates[sort.column];
        const y = b.dates[sort.column];
        if (x == null) return y == null ? 0 : 1;
        if (y == null) return -1;
        return (x - y) * sort.dir;
      }
      const c = compare(a.values[sort.column], b.values[sort.column], numeric);
      return isBlank(a.values[sort.column]) || isBlank(b.values[sort.column]) ? c : c * sort.dir;
    });
  }, [records, sort, dataset]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [records, pageSize]);
  const slice = sorted.slice(current * pageSize, current * pageSize + pageSize);
  const numericCols = useMemo(() => new Set(visible.filter((c) => isNumericColumn(dataset, c))), [visible, dataset]);

  const toggleSort = (column: string) =>
    setSort((s) => (s?.column === column ? (s.dir === -1 ? { column, dir: 1 } : null) : { column, dir: -1 }));

  return (
    <>
      <div className="table-toolbar">
        {toolbar}
        <span className="spacer" />
        <ColumnPicker all={dataset.columns} visible={visible} onChange={setVisible} />
      </div>
      {records.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {visible.map((c, i) => (
                    <th
                      key={c}
                      className={`${numericCols.has(c) ? 'n' : ''} ${i === 0 ? 'sticky-col' : ''}`}
                      aria-sort={sort?.column === c ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                    >
                      <button type="button" onClick={() => toggleSort(c)} title={`Sort by ${c}`}>
                        {c}
                        <Icon name={sort?.column === c ? (sort.dir === 1 ? 'sortAsc' : 'sortDesc') : 'sort'} size={12} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr key={r.idx} className="clickable" onClick={() => setDetail(r)}>
                    {visible.map((c, i) => (
                      <td key={c} className={`${numericCols.has(c) ? 'n' : ''} ${i === 0 ? 'sticky-col' : ''}`}>
                        {renderCell(c, r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <span>
              Showing <b className="num">{fmtNum(current * pageSize + 1)}</b>–<b className="num">{fmtNum(Math.min(sorted.length, (current + 1) * pageSize))}</b> of{' '}
              <b className="num">{fmtNum(sorted.length)}</b>
            </span>
            <span className="spacer" />
            <label>
              Rows{' '}
              <select className="select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-sm" onClick={() => setPage(0)} disabled={current === 0}>
              First
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Previous page">
              <Icon name="chevronLeft" size={14} />
            </button>
            <span className="num">
              Page {current + 1} / {pages}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Next page">
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
        </>
      )}
      {detail && <RowDrawer record={detail} columns={dataset.columns} onClose={() => setDetail(null)} />}
    </>
  );
});
