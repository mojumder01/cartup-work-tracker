/**
 * Dashboard: Regular uploads (Work Sheet, finished, by Upload Month / Upload date) vs Retail Picks
 * uploads (picks sheet, by its Upload Date — column N), in the current filters.
 */
import { memo, useMemo } from 'react';
import { C } from '../../config/dashboard.config';
import { useApp } from '../../hooks/AppContext';
import { presetRange, resolveMonth } from '../../utils/filters';
import { retailUploads } from '../../utils/extraSources';
import { matchName } from '../../utils/individualReport';
import { monthKeyOf, toNumber } from '../../utils/parse';
import { fmtNum } from '../../utils/format';
import { Card, EmptyState } from '../ui';

export const UploadSplitCard = memo(function UploadSplitCard() {
  const { data, dataset, roleRecords, filters } = useApp();
  const regular = roleRecords(C.uploadedBy);
  const reg = useMemo(() => ({ sellers: regular.length, skus: regular.reduce((a, r) => a + (toNumber(r.values[C.uploadedSku]) ?? 0), 0) }), [regular]);

  const picks = useMemo(() => {
    const rows = retailUploads(data.extra?.retail ?? data.performance?.retail);
    if (!rows) return null;
    const range = presetRange(filters);
    const month = resolveMonth(filters.month);
    // Picks spell some names differently ("Iftkhar"): match against the Work Sheet uploaders.
    const people = [...new Set(dataset.records.map((r) => String(r.values[C.uploadedBy] ?? '').trim()).filter(Boolean))];
    const keep = rows.filter((r) => {
      if (range && (r.ms < range[0] || r.ms >= range[1])) return false;
      const mk = monthKeyOf(r.ms);
      if (month && mk !== month) return false;
      if (filters.year && !mk.startsWith(filters.year)) return false;
      if (filters.employee && (matchName(r.name, people) ?? r.name).toLowerCase() !== filters.employee.toLowerCase()) return false;
      return true;
    });
    return { sellers: keep.length, skus: keep.reduce((a, r) => a + r.skus, 0) };
  }, [data, dataset, filters]);

  const total = { sellers: reg.sellers + (picks?.sellers ?? 0), skus: reg.skus + (picks?.skus ?? 0) };
  const pct = (v: number, of: number) => (of ? `${Math.round((v / of) * 1000) / 10}%` : '—');
  const ignored = Object.values(filters.dims).some(Boolean) || !!filters.drill;

  return (
    <Card title="Regular vs Retail Picks uploads" subtitle="Finished uploads · regular = Work Sheet (Upload Month) · picks = Retail Picks sheet (Upload Date)">
      {!dataset.has(C.uploadedBy) ? (
        <EmptyState small />
      ) : (
        <>
          <div className="table-wrap flush" style={{ borderTop: 0, maxHeight: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Upload type</th>
                  <th className="n">Sellers (jobs)</th>
                  <th className="n">Uploaded SKUs</th>
                  <th className="n">Share of SKUs</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Regular upload</td>
                  <td className="n">{fmtNum(reg.sellers)}</td>
                  <td className="n">{fmtNum(reg.skus)}</td>
                  <td className="n">{pct(reg.skus, total.skus)}</td>
                </tr>
                <tr>
                  <td>Retail Picks upload</td>
                  <td className="n">{picks ? fmtNum(picks.sellers) : 'N/A'}</td>
                  <td className="n">{picks ? fmtNum(picks.skus) : 'N/A'}</td>
                  <td className="n">{picks ? pct(picks.skus, total.skus) : '—'}</td>
                </tr>
                <tr>
                  <td>
                    <b>Total</b>
                  </td>
                  <td className="n">
                    <b>{fmtNum(total.sellers)}</b>
                  </td>
                  <td className="n">
                    <b>{fmtNum(total.skus)}</b>
                  </td>
                  <td className="n">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            {picks ? '' : 'Retail Picks sheet not synced — picks are not included. '}
            {ignored && picks ? 'Picks follow only the date, month, year and employee filters. ' : ''}
          </p>
        </>
      )}
    </Card>
  );
});
