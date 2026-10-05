/**
 * Ad-Hoc Tasks → Individual report: "Ad-Hoc Task · <person>" tables (Product Count per task type),
 * chosen week / month vs the one before — the same table as in the Individual Summary report.
 */
import { useMemo, useState } from 'react';
import type { AdhocTask } from '../../utils/governance';
import { adhocPersonBlock } from '../../utils/governanceReport';
import { comparisonPeriod, listPeriods, periodKey, type Period, type PeriodType } from '../../utils/periods';
import { exportXlsxSheets, stamp, type ExportRow } from '../../utils/export';
import { Block } from '../../components/report/ReportBlock';
import { Card, Segmented } from '../../components/ui';
import { Icon } from '../../components/Icon';

export function AdhocIndividual({ tasks, people }: { tasks: AdhocTask[]; people: string[] }) {
  const [type, setType] = useState<PeriodType>('week');
  const [pick, setPick] = useState('');
  const [person, setPerson] = useState('');

  const periods = useMemo(() => {
    const dates = tasks.map((t) => t.date).filter((d): d is number => d !== null);
    if (!dates.length) return [] as Period[];
    return listPeriods(type, Math.min(...dates), Math.max(Date.now(), Math.max(...dates)));
  }, [tasks, type]);
  // Default: the latest period that has entries.
  const latestWithData = useMemo(() => periods.find((p) => tasks.some((t) => t.date !== null && t.date >= p.start && t.date < p.end)) ?? periods[0], [periods, tasks]);
  const cur = periods.find((p) => periodKey(p) === pick) ?? latestWithData;
  const prev = cur ? comparisonPeriod(cur, 'previous') : null;

  const blocks = useMemo(() => {
    if (!cur || !prev) return [];
    const inP = (p: Period) => tasks.filter((t) => t.date !== null && t.date >= p.start && t.date < p.end);
    const a = inP(prev);
    const b = inP(cur);
    const has = (n: string) => [...a, ...b].some((t) => t.person.trim().toLowerCase() === n.toLowerCase());
    const names = person ? [person] : people.filter(has);
    return names.map((n) => adhocPersonBlock(n, a, b, prev, cur));
  }, [tasks, people, person, cur, prev]);

  const download = () => {
    if (!cur || !prev) return;
    const sheet = (title: string, bs: typeof blocks): { name: string; rows: ExportRow[] } => ({
      name: title,
      rows: bs.flatMap((b) => [[b.title], b.head, ...b.rows, ...(b.total ? [b.total] : []), []] as ExportRow[]),
    });
    void exportXlsxSheets(`adhoc-individual-${cur.short}-vs-${prev.short}-${stamp()}.xlsx`.replace(/\s+/g, '-'), [
      { name: 'Info', rows: [['Ad-Hoc Task individual report'], ['Current', `${cur.label} (${cur.range})`], ['Previous', `${prev.label} (${prev.range})`], ['Measure', 'Product Count (SKUs) per Task Type'], ['People', blocks.length]] },
      sheet('All people', blocks),
      ...(blocks.length > 1 ? blocks.map((b) => sheet(b.title.replace('Ad-Hoc Task · ', ''), [b])) : []),
    ]);
  };

  return (
    <Card
      title="Individual report"
      subtitle={cur && prev ? `Ad-Hoc SKUs (Product Count) per task type · ${cur.label} (${cur.range}) vs ${prev.label}` : 'No dated entries yet'}
      actions={
        <button type="button" className="btn btn-sm" onClick={download} disabled={!blocks.length}>
          <Icon name="download" size={14} /> Excel
        </button>
      }
    >
      <div className="filter-row" style={{ marginBottom: 12 }}>
        <Segmented
          label="Period"
          value={type}
          onChange={(v) => {
            setType(v as PeriodType);
            setPick('');
          }}
          options={[
            { id: 'week', label: 'Week' },
            { id: 'month', label: 'Month' },
          ]}
        />
        <label className="field">
          <span>{type === 'week' ? 'Week' : 'Month'}</span>
          <select className="select" style={{ minWidth: 240 }} value={cur ? periodKey(cur) : ''} onChange={(e) => setPick(e.target.value)}>
            {periods.map((p) => (
              <option key={periodKey(p)} value={periodKey(p)}>
                {p.label} · {p.range}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Person</span>
          <select className={`select ${person ? 'is-set' : ''}`} style={{ minWidth: 210 }} value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Everyone with entries</option>
            {people.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      {blocks.length === 0 ? (
        <p className="muted">No Ad-Hoc entries in {cur?.label ?? 'this period'} or {prev?.label ?? 'the one before'}.</p>
      ) : (
        <div className="rs-standalone adhoc-ind-grid">
          {blocks.map((b) => (
            <Block key={b.id} b={b} />
          ))}
        </div>
      )}
    </Card>
  );
}
