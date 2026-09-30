import { memo, useMemo, useState } from 'react';
import { dashboardConfig } from '../config/dashboard.config';
import { useApp } from '../hooks/AppContext';
import { distinct } from '../utils/aggregate';
import { activeFilterCount, DATE_PRESETS, recordMonth, type DatePreset } from '../utils/filters';
import { monthLabel } from '../utils/parse';
import { fmtNum } from '../utils/format';
import { Icon } from './Icon';

/** Dimensions with many values use a type-ahead instead of a dropdown. */
const TYPEAHEAD_THRESHOLD = 60;

function TypeaheadFilter({ column, value, options, onChange }: { column: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setDraft(value);
  }
  const id = `dl-${column.replace(/\W+/g, '-')}`;
  const commit = (v: string) => {
    const match = options.find((o) => o.toLowerCase() === v.trim().toLowerCase());
    if (v.trim() === '') onChange('');
    else if (match) onChange(match);
  };
  return (
    <label className="field">
      <span>{column}</span>
      <input
        className={`input ${value ? 'is-set' : ''}`}
        list={id}
        value={draft}
        placeholder={`All (${fmtNum(options.length)})`}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setDraft(value)}
      />
      <datalist id={id}>
        {options.slice(0, 5000).map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}

function SelectFilter({ label, value, options, onChange, allLabel = 'All' }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; allLabel?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className={`select ${value ? 'is-set' : ''}`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export const FilterBar = memo(function FilterBar({ showRecordsLink = true }: { showRecordsLink?: boolean }) {
  const { dataset, filters, setFilters, setDim, resetFilters, filtered, searched, navigate } = useApp();
  const [more, setMore] = useState(false);
  const cfg = dashboardConfig;

  const options = useMemo(() => {
    const dims: Record<string, string[]> = {};
    for (const c of cfg.filterColumns) if (dataset.has(c)) dims[c] = distinct(dataset.records, c);
    const people = new Set<string>();
    for (const c of cfg.employeeFilterColumns) if (dataset.has(c)) distinct(dataset.records, c).forEach((p) => people.add(p));
    const months = new Set<string>();
    for (const r of dataset.records) {
      const m = recordMonth(r);
      if (m) months.add(m);
    }
    return {
      dims,
      people: [...people].sort((a, b) => a.localeCompare(b)),
      months: [...months].sort().reverse(),
      dateBasis: cfg.dateBasisColumns.filter((c) => dataset.has(c)),
    };
  }, [dataset, cfg]);

  const dimControl = (column: string) => {
    const opts = options.dims[column];
    if (!opts) return null;
    const value = filters.dims[column] ?? '';
    if (opts.length > TYPEAHEAD_THRESHOLD) {
      return <TypeaheadFilter key={column} column={column} value={value} options={opts} onChange={(v) => setDim(column, v)} />;
    }
    return <SelectFilter key={column} label={column} value={value} options={opts.map((o) => ({ value: o, label: o }))} onChange={(v) => setDim(column, v)} />;
  };

  const primary = cfg.primaryFilterColumns;
  const secondary = cfg.filterColumns.filter((c) => !primary.includes(c));
  const count = activeFilterCount(filters);

  const chips: { label: string; clear: () => void }[] = [];
  if (filters.datePreset !== 'all') {
    const p = DATE_PRESETS.find((d) => d.id === filters.datePreset)!.label;
    const range = filters.datePreset === 'custom' ? ` ${filters.dateFrom || '…'} → ${filters.dateTo || '…'}` : '';
    chips.push({ label: `${filters.dateBasis}: ${p}${range}`, clear: () => setFilters((f) => ({ ...f, datePreset: 'all', dateFrom: '', dateTo: '' })) });
  }
  if (filters.month) {
    const l = filters.month === '__current' ? 'Current month' : filters.month === '__previous' ? 'Previous month' : monthLabel(filters.month);
    chips.push({ label: `Month: ${l}`, clear: () => setFilters((f) => ({ ...f, month: '' })) });
  }
  for (const [c, v] of Object.entries(filters.dims)) if (v) chips.push({ label: `${c}: ${v}`, clear: () => setDim(c, '') });
  if (filters.employee) chips.push({ label: `Employee: ${filters.employee}`, clear: () => setFilters((f) => ({ ...f, employee: '' })) });
  if (filters.drill) chips.push({ label: filters.drill.label, clear: () => setFilters((f) => ({ ...f, drill: null })) });
  if (filters.search) chips.push({ label: `Search: “${filters.search}”`, clear: () => setFilters((f) => ({ ...f, search: '' })) });

  return (
    <div className="filterbar" role="region" aria-label="Filters">
      <div className="filter-row">
        <label className="field">
          <span>Date</span>
          <select
            className={`select ${filters.datePreset !== 'all' ? 'is-set' : ''}`}
            value={filters.datePreset}
            onChange={(e) => setFilters((f) => ({ ...f, datePreset: e.target.value as DatePreset }))}
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {filters.datePreset === 'custom' && (
          <>
            <label className="field">
              <span>From</span>
              <input type="date" className="input is-set" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
            </label>
            <label className="field">
              <span>To</span>
              <input type="date" className="input is-set" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
            </label>
          </>
        )}
        <SelectFilter
          label="Month"
          value={filters.month}
          allLabel="All months"
          onChange={(v) => setFilters((f) => ({ ...f, month: v }))}
          options={[
            { value: '__current', label: 'Current month' },
            { value: '__previous', label: 'Previous month' },
            ...options.months.map((m) => ({ value: m, label: monthLabel(m) })),
          ]}
        />
        {primary.map(dimControl)}
        {options.people.length > 0 && (
          <SelectFilter
            label="Employee"
            value={filters.employee}
            onChange={(v) => setFilters((f) => ({ ...f, employee: v }))}
            options={options.people.map((p) => ({ value: p, label: p }))}
          />
        )}
        {more && secondary.map(dimControl)}
        {more && options.dateBasis.length > 1 && (
          <SelectFilter
            label="Date filter applies to"
            value={filters.dateBasis === options.dateBasis[0] ? '' : filters.dateBasis}
            allLabel={options.dateBasis[0]}
            onChange={(v) => setFilters((f) => ({ ...f, dateBasis: v || options.dateBasis[0] }))}
            options={options.dateBasis.slice(1).map((c) => ({ value: c, label: c }))}
          />
        )}
        <div className="filter-actions">
          <button type="button" className="btn btn-sm" onClick={() => setMore((m) => !m)} aria-expanded={more}>
            <Icon name="filter" size={14} />
            {more ? 'Fewer' : 'More filters'}
          </button>
          <button type="button" className="btn btn-sm" onClick={resetFilters} disabled={count === 0}>
            Reset
          </button>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="chips">
          <span className="count">
            <b className="num">{fmtNum(filters.search ? searched.length : filtered.length)}</b> of {fmtNum(dataset.records.length)} records
          </span>
          {chips.map((c) => (
            <span className="chip" key={c.label}>
              {c.label}
              <button type="button" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
          {showRecordsLink && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('work')}>
              View records →
            </button>
          )}
        </div>
      )}
    </div>
  );
});

