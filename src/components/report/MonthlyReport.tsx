/**
 * Reports → Monthly Report: the "August 2026 Monthly Report" deck built from live
 * data. Click any text on a slide to edit it; slides can be hidden, moved and
 * added. Downloads: editable PowerPoint, PDF / Print.
 */
import { createContext, useContext, useMemo, useRef, useState, type CSSProperties } from 'react';
import { C } from '../../config/dashboard.config';
import { useApp } from '../../hooks/AppContext';
import { useGovernance } from '../../hooks/useGovernance';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { buildCatalogueReport } from '../../utils/catalogue';
import { listPeriods, monthPeriod, type Period } from '../../utils/periods';
import { findPerson } from '../../utils/roster';
import { stamp } from '../../utils/export';
import { applyEdits, buildDeck, getPath, orderSlides, TONE_COLOR, TONE_LABEL, type CustomSlide, type Deck, type MSlide, type MTable, type Tone } from '../../utils/monthlyReport';
import { badgeColor, CARD, HEAD, ICE, INK, LINE, MUTED, NAVY, NAVY_2, RED, tableFit, tagWidth } from '../../utils/monthlyPptx';
import { Card } from '../ui';
import { Icon } from '../Icon';
import { useFitScale } from './ReportBuilder';
import './report.css';

interface MonthState {
  edits: Record<string, string>;
  hidden: string[];
  order: string[];
  custom: CustomSlide[];
  people: string[];
}
const EMPTY: MonthState = { edits: {}, hidden: [], order: [], custom: [], people: [] };

const PX = 96;
const pt = (v: number) => `${(v * 96) / 72}px`;
const hex = (c: string) => `#${c}`;
const at = (x: number, y: number, w: number, h: number): CSSProperties => ({ position: 'absolute', left: x * PX, top: y * PX, width: w * PX, height: h * PX });

/* ------------------------------------------------------------------ */
/* Editable text                                                       */
/* ------------------------------------------------------------------ */

interface EditCtx {
  id: string;
  slide: MSlide;
  auto: MSlide;
  setEdit: (key: string, value: string | null) => void;
}
const Ctx = createContext<EditCtx | null>(null);

/** Text at `p` of the current slide; click to edit. An edit equal to the automatic text is dropped. */
function T({ p, style, className }: { p: string; style?: CSSProperties; className?: string }) {
  const c = useContext(Ctx)!;
  const value = String(getPath(c.slide, p) ?? '');
  const auto = String(getPath(c.auto, p) ?? '');
  const edited = value !== auto;
  return (
    <div
      key={value}
      className={`md-t ${edited ? 'md-edited' : ''} ${className ?? ''}`}
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      title={edited ? 'Edited — clear the text and click away to get the automatic text back' : 'Click to edit'}
      onBlur={(e) => {
        const v = e.currentTarget.innerText.replace(/ /g, ' ').trim();
        if (v === value) return;
        c.setEdit(`${c.id}:${p}`, v === '' || v === auto ? null : v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur();
      }}
    >
      {value}
    </div>
  );
}

function Table({ t, p, tone, x, y, w, avail }: { t: MTable; p: string; tone: string; x: number; y: number; w: number; avail: number }) {
  const fit = tableFit(t, avail);
  const first = t.head.length <= 2 ? w * 0.55 : Math.min(w * 0.4, 3.6);
  const other = (w - first) / Math.max(1, t.head.length - 1);
  const cell = (i: number): CSSProperties => ({ width: (i === 0 ? first : other) * PX, height: fit.rowH * PX, textAlign: i === 0 ? 'left' : 'center' });
  return (
    <table className="md-table" style={{ ...at(x, y, w, fit.height), fontSize: pt(fit.font) }}>
      <thead>
        <tr>
          {t.head.map((_, i) => (
            <th key={i} style={{ ...cell(i), background: hex(tone) }}>
              <T p={`${p}.head.${i}`} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {t.rows.map((r, ri) => (
          <tr key={ri} style={{ background: ri % 2 ? hex(CARD) : '#fff' }}>
            {r.map((v, i) => (
              <td key={i} style={{ ...cell(i), fontWeight: /^total/i.test(v) ? 700 : 400 }}>
                <T p={`${p}.rows.${ri}.${i}`} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* Slides                                                              */
/* ------------------------------------------------------------------ */

function Footer({ deck, deckEdit }: { deck: Deck; deckEdit: (v: string | null) => void }) {
  return (
    <>
      <div style={{ ...at(0.5, 6.95, 12.33, 0), borderTop: `1px solid ${hex(LINE)}` }} />
      <T p="foot" style={{ ...at(0.5, 7.05, 8, 0.3), fontSize: pt(9.5), color: hex(MUTED) }} />
      <div
        key={deck.footer}
        className="md-t"
        contentEditable
        suppressContentEditableWarning
        style={{ ...at(7.83, 7.05, 5, 0.3), fontSize: pt(9.5), color: hex(MUTED), textAlign: 'right' }}
        onBlur={(e) => {
          const v = e.currentTarget.innerText.trim();
          if (v !== deck.footer) deckEdit(v || null);
        }}
      >
        {deck.footer}
      </div>
    </>
  );
}

function Header({ s }: { s: Extract<MSlide, { tone: Tone }> }) {
  const tone = hex(TONE_COLOR[s.tone]);
  const w = tagWidth(s.tag);
  return (
    <>
      <div style={{ ...at(0.5, 0.42, w, 0.34), background: tone, borderRadius: 6 }} />
      <T p="tag" style={{ ...at(0.5, 0.42, w, 0.34), fontSize: pt(10.5), fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: `${0.34 * PX}px` }} />
      <T p="title" style={{ ...at(0.5, 0.85, 12.3, 0.6), fontSize: pt(27), fontWeight: 700, color: hex(NAVY), fontFamily: HEAD, display: 'flex', alignItems: 'center' }} />
      <T p="sub" style={{ ...at(0.5, 1.42, 12.3, 0.4), fontSize: pt(13), color: hex(MUTED), display: 'flex', alignItems: 'center' }} />
    </>
  );
}

function SlideView({ s, deck, deckEdit }: { s: MSlide; deck: Deck; deckEdit: (v: string | null) => void }) {
  if (s.kind === 'title') {
    return (
      <div className="md-slide" style={{ background: hex(NAVY) }}>
        <div style={{ ...at(10.6, -1.2, 4.5, 4.5), background: hex(NAVY_2), borderRadius: '50%' }} />
        <div style={{ ...at(11.8, 4.6, 3.2, 3.2), background: hex(NAVY_2), borderRadius: '50%' }} />
        <T p="kicker" style={{ ...at(0.9, 2.0, 8, 0.5), fontSize: pt(18), fontWeight: 700, color: hex(ICE), letterSpacing: '0.12em' }} />
        <T p="title" style={{ ...at(0.9, 2.5, 10.5, 1.1), fontSize: pt(46), fontWeight: 700, color: '#fff', fontFamily: HEAD, display: 'flex', alignItems: 'center' }} />
        <T p="sections" style={{ ...at(0.9, 3.6, 10.5, 0.5), fontSize: pt(18), color: hex(ICE) }} />
        <div style={{ ...at(0.9, 4.2, 2.2, 0), borderTop: `2px solid ${hex(ICE)}` }} />
        <T p="intro" style={{ ...at(0.9, 5.6, 10.2, 1), fontSize: pt(12.5), color: hex(ICE) }} />
      </div>
    );
  }
  if (s.kind === 'overview') {
    const bars = s.bars.filter((b) => b.pct !== null);
    const max = Math.max(100, ...bars.map((b) => b.pct as number)) * 1.15;
    const colors = [TONE_COLOR.prod, TONE_COLOR.qc, TONE_COLOR.vis];
    return (
      <div className="md-slide" style={{ background: hex(NAVY) }}>
        <T p="title" style={{ ...at(0.6, 0.5, 12, 0.6), fontSize: pt(26), fontWeight: 700, color: '#fff', fontFamily: HEAD }} />
        <div style={{ ...at(0.8, 1.4, 6.8, 4.6) }} className="md-chart">
          <div className="md-chart-title">Achieved % vs Target</div>
          <div className="md-bars">
            {bars.length === 0 && <div style={{ color: hex(ICE), alignSelf: 'center', margin: 'auto' }}>N/A — no targets found</div>}
            {bars.map((b, i) => (
              <div className="md-bar" key={b.label}>
                <div className="md-bar-col">
                  <span className="md-bar-v">{b.pct}%</span>
                  <i style={{ height: `${((b.pct as number) / max) * 100}%`, background: hex(colors[s.bars.indexOf(b)] ?? colors[i]) }} />
                </div>
                <span className="md-bar-l">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...at(7.9, 1.4, 5, 4.6), background: hex(NAVY_2), borderRadius: 10 }} />
        <T p="boxTitle" style={{ ...at(8.25, 1.7, 4.3, 0.4), fontSize: pt(15), fontWeight: 700, color: hex(ICE) }} />
        <T p="total" style={{ ...at(8.25, 2.1, 4.3, 0.8), fontSize: pt(38), fontWeight: 700, color: '#fff' }} />
        <T p="totalLabel" style={{ ...at(8.25, 2.9, 4.3, 0.4), fontSize: pt(12.5), color: hex(ICE) }} />
        <div style={{ ...at(8.25, 3.4, 4.3, 0), borderTop: '1px solid #3A4488' }} />
        {s.lines.map((_, i) => (
          <T key={i} p={`lines.${i}`} style={{ ...at(8.25, 3.55 + i * 0.32, 4.3, 0.32), fontSize: pt(14), fontWeight: 700, color: '#fff' }} />
        ))}
        <T p="note" style={{ ...at(8.25, 4.7, 4.3, 1.1), fontSize: pt(11.5), color: hex(ICE) }} />
        <T p="foot" style={{ ...at(0.6, 7.05, 8, 0.35), fontSize: pt(11), color: hex(ICE) }} />
      </div>
    );
  }
  if (s.kind === 'highlights') {
    return (
      <div className="md-slide">
        <div style={{ ...at(0, 0, 13.333, 1.5), background: hex(NAVY) }} />
        <T p="title" style={{ ...at(0.5, 0.35, 10, 0.7), fontSize: pt(30), fontWeight: 700, color: '#fff', fontFamily: HEAD }} />
        <T p="sub" style={{ ...at(0.5, 0.98, 10, 0.4), fontSize: pt(13), color: hex(ICE) }} />
        {s.items.map((it, i) => {
          const y = 1.85 + i * 1.0;
          const c = hex(TONE_COLOR[it.tone]);
          return (
            <div key={i}>
              <div style={{ ...at(0.5, y, 0.5, 0.5), background: c, borderRadius: 7 }} />
              <T p={`items.${i}.letter`} style={{ ...at(0.5, y, 0.5, 0.5), fontSize: pt(16), fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: `${0.5 * PX}px` }} />
              <T p={`items.${i}.label`} style={{ ...at(1.2, y - 0.02, 2.0, 0.5), fontSize: pt(14.5), fontWeight: 700, color: c, display: 'flex', alignItems: 'center' }} />
              <T p={`items.${i}.text`} style={{ ...at(3.35, y - 0.06, 9.45, 0.85), fontSize: pt(12.5), color: hex(INK) }} />
            </div>
          );
        })}
        <Footer deck={deck} deckEdit={deckEdit} />
      </div>
    );
  }
  const tone = TONE_COLOR[s.tone];
  return (
    <div className="md-slide">
      <Header s={s} />
      {s.kind === 'section' && (
        <>
          {s.stats.map((_, i) => {
            const xs = [0.5, 3.5, 6.5, 9.5];
            const w = i === 3 ? 3.3 : 2.85;
            const c = hex(i === 3 ? RED : tone);
            return (
              <div key={i}>
                <div style={{ ...at(xs[i], 2.0, w, 2.0), background: hex(CARD), border: `1px solid ${hex(LINE)}`, borderRadius: 8 }} />
                <div style={{ ...at(xs[i] + 0.2, 2.22, w - 0.4, 0.05), background: c }} />
                <T p={`stats.${i}.value`} style={{ ...at(xs[i] + 0.15, 2.35, w - 0.3, 1.1), fontSize: pt(30), fontWeight: 700, color: c, display: 'flex', alignItems: 'center' }} />
                <T p={`stats.${i}.label`} style={{ ...at(xs[i] + 0.2, 3.45, w - 0.4, 0.5), fontSize: pt(11), color: hex(INK) }} />
              </div>
            );
          })}
          <Table t={s.table} p="table" tone={tone} x={0.5} y={4.4} w={8} avail={2.4} />
          <T p="note" style={{ ...at(8.85, 4.55, 4, 2.0), fontSize: pt(12), color: hex(MUTED) }} />
        </>
      )}
      {s.kind === 'blocks' && <Blocks s={s} tone={tone} />}
      {s.kind === 'text' && (
        <>
          <T p="body" style={{ ...at(0.5, 2.0, 12.3, 0.7), fontSize: pt(13.5), color: hex(INK) }} />
          {s.cards.map((c, i) => {
            const n = s.cards.length;
            const cw = (12.3 - 0.2 * (n - 1)) / n;
            const x = 0.5 + i * (cw + 0.2);
            const bw = Math.max(1.2, 0.3 + c.badge.length * 0.12);
            return (
              <div key={i}>
                <div style={{ ...at(x, 2.85, cw, 3.2), background: hex(CARD), border: `1px solid ${hex(LINE)}`, borderRadius: 8 }} />
                <T p={`cards.${i}.title`} style={{ ...at(x + 0.35, 3.15, cw - 0.7, 0.4), fontSize: pt(16), fontWeight: 700, color: hex(tone) }} />
                <T p={`cards.${i}.body`} style={{ ...at(x + 0.35, 3.65, cw - 0.7, 1.4), fontSize: pt(13), color: hex(INK) }} />
                <div style={{ ...at(x + 0.35, 5.2, bw, 0.4), background: c.badge.trim() ? hex(badgeColor(c.badge)) : 'transparent', border: c.badge.trim() ? 0 : `1px dashed ${hex(LINE)}`, borderRadius: 7 }} />
                <T p={`cards.${i}.badge`} style={{ ...at(x + 0.35, 5.2, bw, 0.4), fontSize: pt(11), fontWeight: 700, color: c.badge.trim() ? '#fff' : hex(MUTED), textAlign: 'center', lineHeight: `${0.4 * PX}px` }} />
              </div>
            );
          })}
        </>
      )}
      <Footer deck={deck} deckEdit={deckEdit} />
    </div>
  );
}

function Blocks({ s, tone }: { s: Extract<MSlide, { kind: 'blocks' }>; tone: string }) {
  let y = 1.95;
  const out = [];
  if (s.lead) {
    out.push(<T key="lead" p="lead" style={{ ...at(0.5, 1.85, 12.3, 0.5), fontSize: pt(13), color: hex(INK) }} />);
    y = 2.45;
  }
  const per = (6.8 - y) / Math.max(1, s.blocks.length);
  s.blocks.forEach((b, i) => {
    let top = y;
    if (b.heading) {
      out.push(<T key={`h${i}`} p={`blocks.${i}.heading`} style={{ ...at(0.5, top, 10, 0.4), fontSize: pt(15), fontWeight: 700, color: hex(NAVY), fontFamily: HEAD }} />);
      top += 0.45;
    }
    const wide = b.table.head.length > 2;
    const avail = y + per - top - (wide && b.note ? 0.55 : 0.1);
    const h = tableFit(b.table, avail).height;
    out.push(<Table key={`t${i}`} t={b.table} p={`blocks.${i}.table`} tone={tone} x={0.5} y={top} w={wide ? 12.3 : 7.6} avail={avail} />);
    if (b.note) {
      out.push(
        <T
          key={`n${i}`}
          p={`blocks.${i}.note`}
          style={wide ? { ...at(0.5, top + h + 0.12, 12.3, 0.45), fontSize: pt(12), color: hex(MUTED) } : { ...at(8.35, top + 0.05, 4.45, Math.max(0.6, h)), fontSize: pt(12), color: hex(MUTED) }}
        />,
      );
    }
    y += per;
  });
  return <>{out}</>;
}

/* ------------------------------------------------------------------ */
/* Print                                                               */
/* ------------------------------------------------------------------ */

function printDeck(el: HTMLElement, title: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('');
  const pages = [...el.querySelectorAll('.md-slide')].map((s) => `<div class="md-page">${s.outerHTML}</div>`).join('');
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${styles}
    <style>@page{size:13.333in 7.5in;margin:0}html,body{margin:0;background:#fff}.md-page{width:1280px;height:720px;overflow:hidden;page-break-after:always;break-after:page}.md-slide{-webkit-print-color-adjust:exact;print-color-adjust:exact}.md-t{outline:none!important;box-shadow:none!important;background:none!important}</style>
    </head><body>${pages}</body></html>`,
  );
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  }, 400);
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function MonthlyReport() {
  const { dataset, data, roster } = useApp();
  const gov = useGovernance();
  const [store, setStore] = useLocalStorage<Record<string, MonthState>>('cartup.monthlyReport', {});

  const months = useMemo(() => {
    let min = Infinity;
    for (const r of dataset.records) for (const c of [C.uploadDate, C.qcDate, C.imageDate]) {
      const ms = r.dates[c];
      if (ms != null && ms < min) min = ms;
    }
    return listPeriods('month', Number.isFinite(min) ? min : Date.now(), Date.now());
  }, [dataset]);
  const [monthStart, setMonthStart] = useState<number | null>(null);
  // Default: the last completed month.
  const month: Period = useMemo(() => {
    const p = months.find((m) => m.start === monthStart) ?? months[1] ?? months[0];
    return p ?? monthPeriod(new Date().getFullYear(), new Date().getMonth());
  }, [months, monthStart]);
  const mKey = new Date(month.start).toISOString().slice(0, 7);
  const st: MonthState = { ...EMPTY, ...(store[mKey] ?? {}) };
  const save = (patch: Partial<MonthState>) => setStore({ ...store, [mKey]: { ...st, ...patch } });

  const fallbackStaff = useMemo(() => {
    const by = (team: string) => roster.filter((p) => p.team === team && p.status === 'Active').map((p) => p.name);
    return { production: by('Production'), qc: by('QC'), visual: by('Visual') };
  }, [roster]);
  const cat = useMemo(
    () => buildCatalogueReport({ ds: dataset, adminQc: data.sellerQc, perf: data.performance, period: { mode: 'month', start: month.start, end: month.end }, fallbackStaff }),
    [dataset, data, month, fallbackStaff],
  );
  const adhocPeople = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of gov.adhoc?.tasks ?? []) if (t.person && t.date !== null && t.date >= month.start && t.date < month.end) m.set(t.person, (m.get(t.person) ?? 0) + t.products);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [gov.adhoc, month]);

  const auto = useMemo(
    () =>
      buildDeck({
        month,
        cat,
        isLeft: (n) => findPerson(roster, n)?.status === 'Left',
        projects: gov.projects,
        logs: gov.logs,
        adhoc: gov.adhoc?.tasks ?? null,
        adhocPeople: st.people,
        custom: st.custom,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [month, cat, roster, gov.projects, gov.logs, gov.adhoc, JSON.stringify(st.people), JSON.stringify(st.custom)],
  );
  const deck = useMemo(() => applyEdits(auto, st.edits), [auto, st.edits]);
  const { all, shown } = orderSlides(deck.slides, st.order, st.hidden);
  const autoById = new Map(auto.slides.map((s) => [s.id, s]));

  const setEdit = (key: string, value: string | null) => {
    const edits = { ...st.edits };
    if (value === null) delete edits[key];
    else edits[key] = value;
    save({ edits });
  };
  const move = (id: string, d: -1 | 1) => {
    const ids = all.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    save({ order: ids });
  };
  const toggle = (id: string) => save({ hidden: st.hidden.includes(id) ? st.hidden.filter((x) => x !== id) : [...st.hidden, id] });
  const [newTone, setNewTone] = useState<Tone>('other');
  const [newCards, setNewCards] = useState(2);
  const addSlide = () => {
    const id = `custom-${Date.now().toString(36)}`;
    const ids = all.map((s) => s.id);
    const over = ids.indexOf('overview');
    ids.splice(over >= 0 ? over : ids.length, 0, id);
    save({ custom: [...st.custom, { id, tone: newTone, cards: newCards }], order: ids });
  };
  const removeSlide = (id: string) => {
    const edits = Object.fromEntries(Object.entries(st.edits).filter(([k]) => !k.startsWith(`${id}:`)));
    save({ custom: st.custom.filter((c) => c.id !== id), order: st.order.filter((x) => x !== id), edits });
  };
  const editCount = Object.keys(st.edits).length;

  const stageRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale(stageRef);
  const [busy, setBusy] = useState(false);
  const title = `${month.label} Monthly Report`;
  const file = `monthly-report-${mKey}-${stamp()}`;

  const downloadPptx = async () => {
    setBusy(true);
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      const { downloadMonthlyPptx } = await import('../../utils/monthlyPptx');
      await downloadMonthlyPptx(deck, shown, `${file}.pptx`);
    } finally {
      setBusy(false);
    }
  };

  const label = (s: MSlide) => s.title.replace(/\s+/g, ' ');

  return (
    <div className="rb-layout">
      <Card title="Report settings" subtitle="Click any text on the slides to edit it · saved in this browser per month">
        <div className="rb-panel">
          <label className="field">
            <span>Month</span>
            <select className="select" value={month.start} onChange={(e) => setMonthStart(Number(e.target.value))}>
              {months.map((m, i) => (
                <option key={m.start} value={m.start}>
                  {m.label}
                  {i === 0 ? ' (so far)' : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="rb-group">
            <span className="rb-label">Slides ({shown.length} of {all.length})</span>
            <div className="md-list">
              {all.map((s, i) => (
                <div key={s.id} className={`md-li ${st.hidden.includes(s.id) ? 'off' : ''}`}>
                  <input type="checkbox" checked={!st.hidden.includes(s.id)} onChange={() => toggle(s.id)} aria-label={`Show ${label(s)}`} />
                  <span className="md-li-n">{i + 1}</span>
                  <span className="md-li-t" title={label(s)}>
                    {label(s)}
                  </span>
                  <button type="button" className="icon-btn" onClick={() => move(s.id, -1)} disabled={i === 0} aria-label="Move up">
                    ↑
                  </button>
                  <button type="button" className="icon-btn" onClick={() => move(s.id, 1)} disabled={i === all.length - 1} aria-label="Move down">
                    ↓
                  </button>
                  {s.id.startsWith('custom-') && (
                    <button type="button" className="icon-btn" onClick={() => window.confirm('Delete this slide?') && removeSlide(s.id)} aria-label="Delete slide">
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rb-group">
            <span className="rb-label">Add a text slide</span>
            <span className="muted" style={{ fontSize: 12 }}>
              For work that is not in the sheets (e.g. Ad-Hoc Part-1 / Part-2 with a COMPLETE / IN PROGRESS badge).
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="select" style={{ width: 150 }} value={newTone} onChange={(e) => setNewTone(e.target.value as Tone)} aria-label="Section">
                {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
                  <option key={t} value={t}>
                    {TONE_LABEL[t]}
                  </option>
                ))}
              </select>
              <select className="select" style={{ width: 110 }} value={newCards} onChange={(e) => setNewCards(Number(e.target.value))} aria-label="Cards">
                {[0, 1, 2, 3].map((c) => (
                  <option key={c} value={c}>
                    {c} card{c === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-sm" onClick={addSlide}>
                + Add slide
              </button>
            </div>
          </div>

          {adhocPeople.length > 0 && (
            <div className="rb-group">
              <span className="rb-label">Ad-Hoc breakdown slide per person</span>
              <div className="rb-checks" style={{ maxHeight: 160 }}>
                {adhocPeople.map((p) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      checked={st.people.some((x) => x.toLowerCase() === p.toLowerCase())}
                      onChange={(e) => save({ people: e.target.checked ? [...st.people, p] : st.people.filter((x) => x.toLowerCase() !== p.toLowerCase()) })}
                    />
                    <span>{p}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="rb-group">
            <span className="rb-label">Where the numbers come from</span>
            <span className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              Production / QC / Visual = team totals of the Monthly Performance report (targets from the Catalogue Overall Performance sheet). Governance = REVAMP projects with “Include in reports” on (Sum projects: the month's
              entries; running-total projects: change during the month). Other / Ad-Hoc = Governance Main tab rows dated in the month. Missing targets show N/A.
            </span>
          </div>

          {editCount > 0 && (
            <button type="button" className="rb-link" style={{ alignSelf: 'flex-start' }} onClick={() => window.confirm(`Undo all ${editCount} text edits for ${month.label}?`) && save({ edits: {} })}>
              Reset {editCount} edit{editCount === 1 ? '' : 's'} to the automatic text
            </button>
          )}
        </div>
      </Card>

      <Card
        title={title}
        subtitle={`${month.range} · ${shown.length} slides · live from Google Sheets · edited text is highlighted while you edit`}
        bodyClassName=""
        actions={
          <div className="rb-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={downloadPptx} disabled={busy} title="Editable PowerPoint file">
              <Icon name="download" size={14} /> {busy ? 'Building…' : 'PowerPoint'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => deckRef.current && printDeck(deckRef.current, title)}>
              <Icon name="download" size={14} /> PDF / Print
            </button>
          </div>
        }
      >
        <div className="report-stage md-stage" ref={stageRef}>
          <div ref={deckRef} className="md-deck">
            {shown.map((s) => (
              <div key={s.id} className="md-wrap" style={{ width: 1280 * scale, height: 720 * scale }}>
                <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                  <Ctx.Provider value={{ id: s.id, slide: s, auto: autoById.get(s.id) ?? s, setEdit }}>
                    <SlideView s={s} deck={deck} deckEdit={(v) => setEdit('deck:footer', v)} />
                  </Ctx.Provider>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
