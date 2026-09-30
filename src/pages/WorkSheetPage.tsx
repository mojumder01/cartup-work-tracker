import { useState } from 'react';
import { useApp } from '../hooks/AppContext';
import { WorkTable, useVisibleColumns } from '../components/WorkTable';
import { Card } from '../components/ui';
import { Icon } from '../components/Icon';
import { exportCsv, exportXlsx, stamp } from '../utils/export';
import { fmtNum } from '../utils/format';

export default function WorkSheetPage() {
  const { dataset, searched, data } = useApp();
  const [visible] = useVisibleColumns(dataset);
  const [busy, setBusy] = useState(false);
  const rows = (cols: string[]) => searched.map((r) => cols.map((c) => r.values[c]));

  const toolbar = (
    <>
      <span className="muted">
        <b className="num" style={{ color: 'var(--ink)' }}>{fmtNum(searched.length)}</b> records
      </span>
      <button type="button" className="btn btn-sm" onClick={() => exportCsv(`work-sheet-filtered-${stamp()}.csv`, visible, rows(visible))} disabled={!searched.length}>
        <Icon name="download" size={14} /> CSV
      </button>
      <button
        type="button"
        className="btn btn-sm"
        disabled={!searched.length || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await exportXlsx(`work-sheet-filtered-${stamp()}.xlsx`, data.work.sheet, visible, rows(visible));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="download" size={14} /> {busy ? 'Preparing…' : 'Excel'}
      </button>
    </>
  );

  return (
    <Card title="Work Sheet" subtitle={`Live rows from “${data.work.sheet}” · click a row for all fields · exports include visible columns and active filters`} bodyClassName="">
      <WorkTable dataset={dataset} records={searched} toolbar={toolbar} />
    </Card>
  );
}
