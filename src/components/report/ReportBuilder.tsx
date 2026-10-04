import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { C } from '../../config/dashboard.config';
import { TEAMS, type TeamId } from '../../config/people.config';
import { useApp } from '../../hooks/AppContext';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { buildIndividualReport, parseSellerQc, type IndividualReport } from '../../utils/individualReport';
import { comparisonPeriod, comparisonTitle, listPeriods, periodContaining, periodKey, type CompareMode, type Period, type PeriodType } from '../../utils/periods';
import { fmtNum } from '../../utils/format';
import { activeDuring, findPerson, leftChecker } from '../../utils/roster';
import { text } from '../../utils/parse';
import { exportXlsx, exportXlsxSheets, stamp, type ExportRow } from '../../utils/export';
import { buildEmployeeDetail } from '../../utils/employeeDetail';
import { checkCredit, creditRule } from '../../utils/credit';
import { useGovernance } from '../../hooks/useGovernance';
import { adhocPersonBlock, defaultIncluded, inReport, projectBlock, projectGlance, type Cell, type ReportBlock } from '../../utils/governanceReport';
import type { GlanceItem } from '../../utils/individualReport';
import { Card, Segmented } from '../ui';
import { Icon } from '../Icon';
import { ReportSlide, type Highlight } from './ReportSlide';
import './report.css';

interface Settings {
  periodType: PeriodType;
  /** Period start (ms) or null = latest completed period. */
  periodStart: number | null;
  compare: CompareMode;
  teams: TeamId[];
  /** Explicit selection per team; missing team = automatic selection. */
  people: Partial<Record<TeamId, string[]>>;
  showGlance: boolean;
  highlights: Highlight[];
  /** "New" labels for people with no work in the previous period. */
  markNew: 'off' | 'auto';
  /** Add the Retail [Picks] Upload Request sheet as its own table. */
  includeRetail: boolean;
  /** Explicit on/off per project table; missing = automatic (open or active in the two periods). */
  projects: Record<string, boolean>;
  /** People who get an "Ad-Hoc Task · <name>" table (Governance Main tab). */
  adhocPeople: string[];
}

const DEFAULT_SETTINGS: Settings = {
  periodType: 'week',
  periodStart: null,
  compare: 'previous',
  teams: ['Production', 'Visual', 'QC'],
  people: {},
  showGlance: true,
  highlights: [],
  markNew: 'off',
  includeRetail: true,
  projects: {},
  adhocPeople: [],
};

const ROLE: Record<string, string> = { Production: C.uploadedBy, Visual: C.visualEditor, QC: C.qcBy };
const ROLE_DATE: Record<string, string> = { Production: C.uploadDate, Visual: C.imageDate, QC: C.qcDate };

/** Opens the slide alone in a print frame so the browser's "Save as PDF" gives a clean 16:9 page. */
export function printSlide(el: HTMLElement, title: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('');
  // Fit the whole slide on one 16:9 page (1280×720 CSS px), however many people are listed.
  const zoom = Math.min(1, 716 / Math.max(el.offsetHeight, 1), 1276 / Math.max(el.offsetWidth, 1));
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${styles}
    <style>@page{size:338.67mm 190.5mm;margin:0}html,body{margin:0;background:#fff;overflow:hidden}.report-slide{box-shadow:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>
    </head><body><div style="display:flex;justify-content:center"><div style="zoom:${zoom}">${el.outerHTML}</div></div></body></html>`,
  );
  doc.close();
  const go = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  };
  // Give stylesheets/fonts a moment to load inside the frame.
  setTimeout(go, 400);
}

export function useFitScale(ref: React.RefObject<HTMLDivElement | null>, width = 1280) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 32) / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, width]);
  return scale;
}

export function ReportBuilder() {
  const { dataset, data, roster, kpi, navigate } = useApp();
  const gov = useGovernance();
  const [settings, setSettings] = useLocalStorage<Settings>('cartup.reportSettings', DEFAULT_SETTINGS);
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const update = (patch: Partial<Settings>) => setSettings({ ...s, ...patch });

  // Editable text is kept per generated report; null = use the automatic text.
  const [summaryEdit, setSummaryEdit] = useState<string | null>(null);
  const [notesEdit, setNotesEdit] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState(() => Date.now());
  const [showIdle, setShowIdle] = useState<Partial<Record<TeamId, boolean>>>({});

  const sellerQc = useMemo(() => parseSellerQc(data.sellerQc), [data.sellerQc]);

  // Available periods: from the earliest upload/QC/image date to today.
  const periods = useMemo(() => {
    let min = Infinity;
    for (const r of dataset.records) {
      for (const c of [C.uploadDate, C.qcDate, C.imageDate]) {
        const ms = r.dates[c];
        if (ms != null && ms < min) min = ms;
      }
    }
    if (!Number.isFinite(min)) min = Date.now();
    return listPeriods(s.periodType, min, Date.now());
  }, [dataset, s.periodType]);

  // Default = latest completed period (the one before the current, still-running period).
  const cur: Period = useMemo(() => {
    const chosen = s.periodStart !== null ? periods.find((p) => p.start === s.periodStart) : undefined;
    return chosen ?? periods[1] ?? periods[0] ?? periodContaining(s.periodType, Date.now());
  }, [periods, s.periodStart, s.periodType]);
  const prev = useMemo(() => comparisonPeriod(cur, s.compare), [cur, s.compare]);

  // Who can be picked per team, and who is picked by default.
  const candidates = useMemo(() => {
    const out: Record<string, { name: string; fullName: string; left: boolean; inTeam: boolean; jobs: number }[]> = {};
    for (const t of TEAMS) {
      const role = ROLE[t.id];
      const dateCol = ROLE_DATE[t.id];
      const jobs = new Map<string, number>();
      if (dataset.has(role)) {
        for (const r of dataset.records) {
          const ms = r.dates[dateCol];
          if (ms == null || !((ms >= prev.start && ms < prev.end) || (ms >= cur.start && ms < cur.end))) continue;
          const rule = creditRule(role);
          if (rule && !checkCredit(dataset, r, rule).counted) continue;
          const n = text(r.values[role]);
          if (n) jobs.set(n, (jobs.get(n) ?? 0) + 1);
        }
      }
      if (t.id === 'QC' && sellerQc) {
        for (const row of sellerQc) {
          if (row.date == null || !((row.date >= prev.start && row.date < prev.end) || (row.date >= cur.start && row.date < cur.end))) continue;
          if (row.qcBy) jobs.set(row.qcBy, (jobs.get(row.qcBy) ?? 0) + 1);
        }
      }
      const names = new Set<string>([...jobs.keys()]);
      roster.filter((p) => p.team === t.id && activeDuring(p, prev.start)).forEach((p) => names.add(p.name));
      out[t.id] = [...names]
        .map((name) => {
          const p = findPerson(roster, name);
          return {
            name,
            fullName: p?.fullName ?? name,
            left: p ? !activeDuring(p, prev.start) : false,
            inTeam: p?.team === t.id,
            jobs: [...jobs.entries()].find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? 0,
          };
        })
        .sort((a, b) => Number(b.inTeam) - Number(a.inTeam) || b.jobs - a.jobs || a.fullName.localeCompare(b.fullName));
    }
    return out;
  }, [dataset, roster, sellerQc, prev, cur]);

  const autoSelection = (team: TeamId) => (candidates[team] ?? []).filter((c) => c.inTeam && !c.left && c.jobs > 0).map((c) => c.name);
  const selected = (team: TeamId) => s.people[team] ?? autoSelection(team);

  const report: IndividualReport = useMemo(
    () =>
      buildIndividualReport({
        ds: dataset,
        sellerQc,
        roster,
        prev,
        cur,
        teams: s.teams,
        people: Object.fromEntries(TEAMS.map((t) => [t.id, selected(t.id)])),
        retail: data.extra?.retail ?? null,
        includeRetail: s.includeRetail,
        pendingQc: data.extra?.pendingQc ?? null,
      }),
    [dataset, sellerQc, roster, prev, cur, s.teams, s.people, s.includeRetail, data.extra, candidates],
  );

  // Project tables placed in this report ("Individual Summary" or "Both").
  const myProjects = useMemo(() => gov.projects.filter((p) => inReport(p, 'Individual Summary')), [gov.projects]);
  const projIncluded = (id: string) => {
    const p = myProjects.find((x) => x.id === id)!;
    return s.projects[id] ?? defaultIncluded(p, gov.logs, prev, cur);
  };
  const chosenProjects = myProjects
    .slice()
    .reverse()
    .filter((p) => projIncluded(p.id));
  const chosenKey = chosenProjects.map((p) => p.id).join();
  const projBlocks: ReportBlock[] = useMemo(() => {
    const n = (b: ReportBlock) => b.head.length;
    // With automatic labels off, "New" in the change column becomes the plain number (current − 0).
    const plain = (b: ReportBlock, r: Cell[]) =>
      s.markNew === 'off' ? (b.deltaCol && r[n(b) - 1] === 'New' ? [...r.slice(0, n(b) - 1), typeof r[n(b) - 2] === 'number' ? r[n(b) - 2] : 0] : r) : r;
    return chosenProjects.map((p) => {
      const b = projectBlock(p, gov.logs, prev, cur);
      return { ...b, rows: b.rows.map((r) => plain(b, r)), tag: s.markNew === 'auto' ? b.tag : undefined };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenKey, gov.logs, gov.projects, prev, cur, s.markNew]);
  // Ad-Hoc Task tables per person (Governance Main tab, Product Count by task type).
  const adhocIn = (p: Period) => (gov.adhoc?.tasks ?? []).filter((t) => t.date !== null && t.date >= p.start && t.date < p.end);
  const adhocChoices = useMemo(() => {
    const m = new Map<string, { name: string; skus: number }>();
    const isLeft = leftChecker(roster);
    for (const t of [...adhocIn(prev), ...adhocIn(cur)]) {
      if (!t.person || isLeft(t.person)) continue;
      const g = m.get(t.person.toLowerCase()) ?? { name: t.person, skus: 0 };
      g.skus += t.products;
      m.set(t.person.toLowerCase(), g);
    }
    return [...m.values()].sort((a, b) => b.skus - a.skus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gov.adhoc, prev, cur, roster]);
  const adhocBlocks: ReportBlock[] = useMemo(
    () =>
      s.adhocPeople
        .filter((n) => adhocChoices.some((c) => c.name.toLowerCase() === n.toLowerCase()))
        .map((n) => adhocPersonBlock(adhocChoices.find((c) => c.name.toLowerCase() === n.toLowerCase())!.name, adhocIn(prev), adhocIn(cur), prev, cur)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.adhocPeople.join(), adhocChoices, gov.adhoc, prev, cur],
  );
  const slideBlocks = useMemo(() => [...projBlocks, ...adhocBlocks], [projBlocks, adhocBlocks]);

  const glance: GlanceItem[] = useMemo(() => {
    const extra = chosenProjects.map((p) => projectGlance(p, gov.logs, prev, cur)).filter((g): g is NonNullable<typeof g> => !!g);
    return [...report.glance, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.glance, chosenKey, gov.logs, gov.projects, prev, cur]);

  // Reset hand-edited text when the report's scope changes.
  const scopeKey = `${periodKey(cur)}|${periodKey(prev)}|${s.teams.join()}|${JSON.stringify(s.people)}`;
  useEffect(() => {
    setSummaryEdit(null);
    setNotesEdit(null);
    setGeneratedAt(Date.now());
  }, [scopeKey]);

  const summary = summaryEdit ?? report.summary;
  const autoNotes = s.markNew === 'auto' ? report.notes : report.notes.filter((n) => !n.startsWith('New in production'));
  const notes = (notesEdit ?? autoNotes.join('\n')).split('\n').map((l) => l.trim()).filter(Boolean);
  const title = `Individual Summary — ${comparisonTitle(prev, cur)}`;

  const slideRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale(stageRef);
  const [slideHeight, setSlideHeight] = useState(720);
  useLayoutEffect(() => {
    if (slideRef.current) setSlideHeight(slideRef.current.offsetHeight);
  });

  const toggleTeam = (t: TeamId) => update({ teams: s.teams.includes(t) ? s.teams.filter((x) => x !== t) : [...s.teams, t] });
  const setTeamPeople = (t: TeamId, names: string[] | null) => {
    const next = { ...s.people };
    if (names === null) delete next[t];
    else next[t] = names;
    update({ people: next });
  };

  const [detailPerson, setDetailPerson] = useState('');
  const [detailBusy, setDetailBusy] = useState(false);
  const detailChoices = useMemo(() => {
    const m = new Map<string, string>();
    Object.values(candidates).flat().forEach((c) => m.set(c.name.toLowerCase(), c.name));
    roster.forEach((p) => !m.has(p.name.toLowerCase()) && m.set(p.name.toLowerCase(), p.name));
    const isLeft = leftChecker(roster);
    return [...m.values()].filter((n) => !isLeft(n)).sort((a, b) => a.localeCompare(b));
  }, [candidates, roster]);
  const downloadDetail = async () => {
    if (!detailPerson) return;
    setDetailBusy(true);
    try {
      const sheets = buildEmployeeDetail({
        name: detailPerson, ds: dataset, sellerQc, roster, kpi, prev, cur,
        adhoc: gov.adhoc?.tasks, projects: gov.projects, logs: gov.logs,
      });
      const safe = detailPerson.replace(/[^\w-]+/g, '-');
      await exportXlsxSheets(`employee-detail-${safe}-${prev.short}-vs-${cur.short}-${stamp()}.xlsx`.replace(/\s+/g, '-'), sheets);
    } finally {
      setDetailBusy(false);
    }
  };

  const downloadExcel = async () => {
    const rows: ExportRow[] = [[title], [summary], []];
    for (const sec of report.sections) {
      rows.push([sec.title]);
      rows.push(['Name', ...sec.columns.map((c) => `${prev.short} ${c.label}`), ...sec.columns.map((c) => `${cur.short} ${c.label}`), sec.deltaLabel]);
      for (const r of sec.rows) {
        rows.push([r.fullName, ...sec.columns.map((c) => r.prev?.[c.key] ?? null), ...sec.columns.map((c) => r.cur?.[c.key] ?? null), r.isNew && s.markNew === 'auto' ? 'New' : r.delta]);
      }
      rows.push(['Total', ...sec.columns.map((c) => sec.total.prev[c.key]), ...sec.columns.map((c) => sec.total.cur[c.key]), sec.total.delta]);
      rows.push([]);
    }
    for (const b of slideBlocks) {
      rows.push([b.tag ? `${b.title} · ${b.tag}` : b.title]);
      rows.push(b.head.map((x) => x.replace('\n', ' ')));
      b.rows.forEach((r) => rows.push(r));
      if (b.total) rows.push(b.total);
      if (b.note) rows.push([b.note]);
      rows.push([]);
    }
    rows.push(['At a Glance', prev.label, cur.label]);
    glance.forEach((g) => rows.push(g.text && (g.prev === null || g.cur === null) ? [g.label, null, g.text] : [g.label, g.prev, g.cur]));
    rows.push([]);
    rows.push(['Key Notes']);
    notes.forEach((n) => rows.push([n]));
    const width = Math.max(...rows.map((r) => r.length));
    await exportXlsx(`individual-summary-${prev.short}-vs-${cur.short}-${stamp()}.xlsx`, 'Individual Summary', Array(width).fill(''), rows.map((r) => [...r, ...Array(width - r.length).fill(null)]));
  };

  return (
    <div className="rb-layout">
      <Card title="Report settings" subtitle="Everything updates instantly; your choices are remembered in this browser">
        <div className="rb-panel">
          <div className="rb-group">
            <span className="rb-label">Report type</span>
            <Segmented
              label="Report type"
              value={s.periodType}
              onChange={(v) => update({ periodType: v, periodStart: null })}
              options={[
                { id: 'week', label: 'Weekly' },
                { id: 'month', label: 'Monthly' },
                { id: 'year', label: 'Yearly' },
              ]}
            />
          </div>
          <label className="field">
            <span>Period</span>
            <select className="select" value={cur.start} onChange={(e) => update({ periodStart: Number(e.target.value) })}>
              {periods.map((p, i) => (
                <option key={p.start} value={p.start}>
                  {p.type === 'week' ? `${p.label}, ${p.year} · ${p.range}` : p.label}
                  {i === 0 ? ' (in progress)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="rb-group">
            <span className="rb-label">Compare with</span>
            <Segmented
              label="Compare with"
              value={s.compare}
              onChange={(v) => update({ compare: v })}
              options={[
                { id: 'previous', label: s.periodType === 'week' ? 'Previous week' : s.periodType === 'month' ? 'Previous month' : 'Previous year' },
                ...(s.periodType === 'year' ? [] : [{ id: 'lastYear' as const, label: 'Same period last year' }]),
              ]}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              {prev.label} ({prev.range}) → {cur.label} ({cur.range})
            </span>
          </div>

          <div className="rb-group">
            <span className="rb-label">Employee detail report</span>
            <span className="muted" style={{ fontSize: 12.5 }}>
              One person, these two periods: the summary numbers plus every sheet row they were added up from, and assigned work that was not counted (with the reason).
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="select" value={detailPerson} onChange={(e) => setDetailPerson(e.target.value)} aria-label="Employee for the detail report">
                <option value="">— Choose an employee —</option>
                {detailChoices.map((n) => (
                  <option key={n} value={n}>
                    {findPerson(roster, n)?.fullName && findPerson(roster, n)!.fullName !== n ? `${findPerson(roster, n)!.fullName} (${n})` : n}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-sm" disabled={!detailPerson || detailBusy} onClick={downloadDetail}>
                <Icon name="download" size={14} /> {detailBusy ? 'Building…' : 'Excel'}
              </button>
            </div>
          </div>

          <div className="rb-group">
            <span className="rb-label">Teams & people</span>
            {TEAMS.map((t) => {
              const list = candidates[t.id] ?? [];
              const sel = new Set(selected(t.id));
              const on = s.teams.includes(t.id);
              return (
                <div key={t.id} className="rb-group">
                  <div className="rb-team-head">
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
                      <input type="checkbox" checked={on} onChange={() => toggleTeam(t.id)} />
                      {t.label}
                    </label>
                    {on && (
                      <span className="spacer">
                        <button type="button" className="rb-link" onClick={() => setTeamPeople(t.id, list.map((c) => c.name))}>
                          All
                        </button>
                        <button type="button" className="rb-link" onClick={() => setTeamPeople(t.id, [])}>
                          None
                        </button>
                        <button type="button" className="rb-link" onClick={() => setTeamPeople(t.id, null)} title="Active team members with work in either period">
                          Auto
                        </button>
                      </span>
                    )}
                  </div>
                  {on && (
                    <div className="rb-checks">
                      {list.length === 0 && <span className="muted" style={{ padding: 6, fontSize: 12.5 }}>Nobody worked in this role in these periods.</span>}
                      {list.filter((c) => showIdle[t.id] || c.jobs > 0 || sel.has(c.name)).map((c) => (
                        <label key={c.name}>
                          <input
                            type="checkbox"
                            checked={sel.has(c.name)}
                            onChange={(e) =>
                              setTeamPeople(t.id, e.target.checked ? [...selected(t.id), c.name] : selected(t.id).filter((n) => n !== c.name))
                            }
                          />
                          <span>{c.fullName}</span>
                          {c.left && <span className="badge bad">Left</span>}
                          {!c.inTeam && !c.left && <span className="badge">other team</span>}
                          <span className="meta">{c.jobs ? `${c.jobs} jobs` : 'no work'}</span>
                        </label>
                      ))}
                      {list.some((c) => !c.jobs && !sel.has(c.name)) && (
                        <button type="button" className="rb-link" style={{ alignSelf: 'flex-start' }} onClick={() => setShowIdle({ ...showIdle, [t.id]: !showIdle[t.id] })}>
                          {showIdle[t.id] ? 'Hide people with no work' : `Show ${list.filter((c) => !c.jobs && !sel.has(c.name)).length} more with no work in these periods`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <button type="button" className="rb-link" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('people')}>
              Manage team members / mark who left →
            </button>
          </div>

          <div className="rb-group">
            <span className="rb-label">“New” labels</span>
            <Segmented
              label="New labels"
              value={s.markNew}
              onChange={(v) => update({ markNew: v })}
              options={[
                { id: 'off', label: 'Off (show numbers)' },
                { id: 'auto', label: 'Automatic' },
              ]}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Automatic shows “New” for anyone with no work in {prev.label}.
            </span>
          </div>

          {data.extra?.retail && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={s.includeRetail} onChange={(e) => update({ includeRetail: e.target.checked })} />
              Add Retail [Picks] uploads to the Production table
            </label>
          )}
          {myProjects.length > 0 && (
            <div className="rb-group">
              <span className="rb-label">Project tables</span>
              <span className="muted" style={{ fontSize: 12 }}>
                Projects set to “Individual Summary” or “Both” on the REVAMP Projects page.
              </span>
              <div className="rb-checks" style={{ maxHeight: 200 }}>
                {myProjects.map((p) => (
                  <label key={p.id}>
                    <input type="checkbox" checked={projIncluded(p.id)} onChange={(e) => update({ projects: { ...s.projects, [p.id]: e.target.checked } })} />
                    <span style={{ flex: 1 }}>
                      {p.name}
                      <span className="meta"> · {p.layout}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {adhocChoices.length > 0 && (
            <div className="rb-group">
              <span className="rb-label">Ad-Hoc Task tables</span>
              <span className="muted" style={{ fontSize: 12 }}>
                One table per person: SKUs by task type, {prev.short} vs {cur.short} (Governance Main tab).
              </span>
              <div className="rb-checks" style={{ maxHeight: 200 }}>
                {adhocChoices.map((c) => (
                  <label key={c.name}>
                    <input
                      type="checkbox"
                      checked={s.adhocPeople.some((x) => x.toLowerCase() === c.name.toLowerCase())}
                      onChange={(e) =>
                        update({ adhocPeople: e.target.checked ? [...s.adhocPeople, c.name] : s.adhocPeople.filter((x) => x.toLowerCase() !== c.name.toLowerCase()) })
                      }
                    />
                    <span style={{ flex: 1 }}>
                      {c.name}
                      <span className="meta"> · {fmtNum(c.skus)} SKUs</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={s.showGlance} onChange={(e) => update({ showGlance: e.target.checked })} />
            Show “At a Glance” panel
          </label>

          <label className="field">
            <span>Summary line</span>
            <textarea className="rb-textarea" style={{ minHeight: 70 }} value={summary} onChange={(e) => setSummaryEdit(e.target.value)} />
          </label>
          <label className="field">
            <span>Key notes (one per line)</span>
            <textarea className="rb-textarea" value={notesEdit ?? autoNotes.join('\n')} onChange={(e) => setNotesEdit(e.target.value)} />
          </label>
          {(summaryEdit !== null || notesEdit !== null) && (
            <button
              type="button"
              className="rb-link"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                setSummaryEdit(null);
                setNotesEdit(null);
              }}
            >
              Reset text to automatic
            </button>
          )}

          <div className="rb-group">
            <span className="rb-label">Extra highlight boxes</span>
            <span className="muted" style={{ fontSize: 12 }}>
              For work that is not in the Work Sheet (e.g. Campaign Sticker, Keyword Tag Checking, Category Revamp).
            </span>
            {s.highlights.map((h, i) => (
              <div className="rb-hl" key={i}>
                <input
                  className="input"
                  value={h.title}
                  placeholder="Title"
                  onChange={(e) => update({ highlights: s.highlights.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                />
                <button type="button" className="icon-btn" aria-label="Remove box" onClick={() => update({ highlights: s.highlights.filter((_, j) => j !== i) })}>
                  <Icon name="x" size={14} />
                </button>
                <textarea
                  className="rb-textarea"
                  value={h.body}
                  placeholder="Text shown in the box"
                  onChange={(e) => update({ highlights: s.highlights.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })}
                />
              </div>
            ))}
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => update({ highlights: [...s.highlights, { title: '', body: '' }] })}>
              + Add box
            </button>
          </div>
        </div>
      </Card>

      <Card
        title={title}
        subtitle={`${prev.range} vs ${cur.range} · live from Google Sheets · global dashboard filters are not applied`}
        bodyClassName=""
        actions={
          <div className="rb-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => slideRef.current && printSlide(slideRef.current, title)}>
              <Icon name="download" size={14} /> PDF / Print
            </button>
            <button type="button" className="btn btn-sm" onClick={downloadExcel}>
              <Icon name="download" size={14} /> Excel
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setGeneratedAt(Date.now())} title="Recalculate with the latest data">
              <Icon name="refresh" size={14} /> Regenerate
            </button>
          </div>
        }
      >
        <div className="report-stage" ref={stageRef}>
          <div style={{ height: slideHeight * scale, width: 1280 * scale }}>
            <div className="report-scale" style={{ transform: `scale(${scale})` }}>
              <ReportSlide
                ref={slideRef}
                report={{ ...report, glance }}
                summary={summary}
                notes={notes}
                highlights={s.highlights.filter((h) => h.title || h.body)}
                showGlance={s.showGlance}
                generatedAt={generatedAt}
                markNew={s.markNew === 'auto'}
                blocks={slideBlocks}
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
