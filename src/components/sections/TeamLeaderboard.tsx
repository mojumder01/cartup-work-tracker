import { memo, useMemo, useState } from 'react';
import { dashboardConfig, C } from '../../config/dashboard.config';
import { useApp } from '../../hooks/AppContext';
import { personTable, type PersonRow } from '../../utils/aggregate';
import { creditRule } from '../../utils/credit';
import { fmtNum, fmtPct } from '../../utils/format';
import { Card, EmptyState, Segmented } from '../ui';

type Col = { key: keyof PersonRow; label: string };

/** Which measures are meaningful for each role column. */
const ROLE_COLUMNS: Record<string, Col[]> = {
  [C.uploadedBy]: [
    { key: 'jobs', label: 'Jobs' },
    { key: 'sku', label: 'SKU' },
    { key: 'uploadedSku', label: 'Uploaded SKU' },
    { key: 'rejectedSku', label: 'Rejected SKU' },
  ],
  [C.qcBy]: [
    { key: 'jobs', label: 'Jobs' },
    { key: 'approvedQc', label: 'QC approved' },
    { key: 'rejectedQc', label: 'QC rejected' },
  ],
  [C.visualEditor]: [
    { key: 'jobs', label: 'Jobs' },
    { key: 'images', label: 'Images' },
    { key: 'manual', label: 'Manual edited' },
    { key: 'ai', label: 'AI edited' },
  ],
};
const DEFAULT_COLS: Col[] = [
  { key: 'jobs', label: 'Jobs' },
  { key: 'sku', label: 'SKU' },
  { key: 'uploadedSku', label: 'Uploaded SKU' },
  { key: 'approvedQc', label: 'QC approved' },
];

export const TeamLeaderboard = memo(function TeamLeaderboard({ limit = 12 }: { limit?: number }) {
  const { dataset, roleRecords, openPerson } = useApp();
  const roles = dashboardConfig.personColumns.filter((c) => dataset.has(c));
  const [role, setRole] = useState(roles[0] ?? '');
  const [all, setAll] = useState(false);
  const rows = useMemo(() => (role ? personTable(roleRecords(role), role) : []), [roleRecords, role]);
  const cols = ROLE_COLUMNS[role] ?? DEFAULT_COLS;
  if (!roles.length) {
    return (
      <Card title="Team Performance">
        <EmptyState title="N/A" message="No people columns (Uploaded by, QC By, Visual editor…) were found." small />
      </Card>
    );
  }
  const shown = all ? rows : rows.slice(0, limit);
  const max = Math.max(...rows.map((r) => r[cols[1]?.key ?? 'jobs'] as number), 1);
  return (
    <Card
      title="Team Performance"
      subtitle={creditRule(role) ? `Finished work only (${creditRule(role)!.status}: ${creditRule(role)!.done.join(' / ')}), dated by ${creditRule(role)!.date} · click a name` : 'Per person · click a name for the full profile'}
      actions={<Segmented label="Role" value={role} onChange={setRole} options={roles.map((r) => ({ id: r, label: r }))} />}
      bodyClassName=""
    >
      {rows.length === 0 ? (
        <EmptyState small />
      ) : (
        <>
          <div className="table-wrap flush" style={{ borderTop: '1px solid var(--border)' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{role}</th>
                  {cols.map((c) => (
                    <th key={c.key} className="n">
                      {c.label}
                    </th>
                  ))}
                  <th style={{ width: '22%' }}>{cols[1]?.label ?? 'Jobs'}</th>
                  {role === C.qcBy && <th className="n">Approval rate</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.name} className="clickable" onClick={() => openPerson(r.name)}>
                    <td className="muted num">{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    {cols.map((c) => (
                      <td key={c.key} className="n">
                        {fmtNum(r[c.key] as number)}
                      </td>
                    ))}
                    <td>
                      <div className="barlist-track">
                        <i style={{ width: `${((r[cols[1]?.key ?? 'jobs'] as number) / max) * 100}%`, background: 'var(--series-1)' }} />
                      </div>
                    </td>
                    {role === C.qcBy && (
                      <td className="n">{fmtPct(r.approvedQc + r.rejectedQc > 0 ? (r.approvedQc / (r.approvedQc + r.rejectedQc)) * 100 : null)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <div style={{ padding: '10px 18px' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll((a) => !a)}>
                {all ? 'Show less' : `Show all ${rows.length}`}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
});
