/**
 * Editable PowerPoint for the Monthly Report, in the layout of the
 * "August 2026 Monthly Report" template (13.33 × 7.5 in). Every text is a text
 * box, every table a PowerPoint table and the overview chart a native chart, so
 * the file can be edited after downloading. Loaded only when clicked.
 */
import { TONE_COLOR, type Deck, type MSlide, type MTable } from './monthlyReport';

export const NAVY = '1E2761';
export const NAVY_2 = '27317A';
export const ICE = 'CADCFC';
export const INK = '26304D';
export const MUTED = '6B7280';
export const CARD = 'F4F6FB';
export const LINE = 'DFE4F0';
export const RED = 'B23A2E';
export const HEAD = 'Cambria';
export const BODY = 'Calibri';

/** Badge colour: green for done/complete, amber otherwise. */
export const badgeColor = (t: string) => (/complete|done|finished/i.test(t) ? '2E7D32' : 'C97A1E');
/** Width of a section tag pill (inches). */
export const tagWidth = (t: string) => Math.max(0.56, 0.2 + t.length * 0.095);

/** Table geometry shared by the preview and the PowerPoint file. */
export function tableFit(t: MTable, avail: number) {
  const rows = t.rows.length + 1;
  const rowH = Math.max(0.24, Math.min(0.33, avail / rows));
  const font = rowH >= 0.3 ? 12.5 : rowH >= 0.27 ? 11 : 10;
  return { rowH, font, height: rowH * rows };
}

type Pptx = InstanceType<typeof import('pptxgenjs').default>;
type Slide = ReturnType<Pptx['addSlide']>;

export async function downloadMonthlyPptx(deck: Deck, slides: MSlide[], fileName: string) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = `${deck.month.label} Monthly Report`;

  const text = (s: Slide, t: string, o: Record<string, unknown>) => s.addText(t, { isTextBox: true, fontFace: BODY, margin: 0, valign: 'top', ...o } as never);
  const footer = (s: Slide, left: string) => {
    s.addShape('line', { x: 0.5, y: 6.95, w: 12.33, h: 0, line: { color: LINE, width: 1 } });
    text(s, left, { x: 0.5, y: 7.05, w: 8, h: 0.3, fontSize: 9.5, color: MUTED });
    text(s, deck.footer, { x: 7.83, y: 7.05, w: 5, h: 0.3, fontSize: 9.5, color: MUTED, align: 'right' });
  };
  const header = (s: Slide, tone: string, tag: string, title: string, sub: string) => {
    const w = tagWidth(tag);
    s.addShape('roundRect', { x: 0.5, y: 0.42, w, h: 0.34, fill: { color: tone }, line: { color: tone }, rectRadius: 0.06 });
    text(s, tag, { x: 0.5, y: 0.42, w, h: 0.34, fontSize: 10.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    text(s, title, { x: 0.5, y: 0.85, w: 12.3, h: 0.6, fontSize: 27, bold: true, color: NAVY, fontFace: HEAD, valign: 'middle' });
    if (sub) text(s, sub, { x: 0.5, y: 1.42, w: 12.3, h: 0.4, fontSize: 13, color: MUTED, valign: 'middle' });
  };
  const table = (s: Slide, t: MTable, tone: string, x: number, y: number, w: number, avail: number) => {
    const fit = tableFit(t, avail);
    const first = t.head.length <= 2 ? w * 0.55 : Math.min(w * 0.4, 3.6);
    const other = (w - first) / Math.max(1, t.head.length - 1);
    const cell = (v: string, i: number, head: boolean, zebra: boolean) => ({
      text: v,
      options: {
        bold: head || /^total/i.test(v),
        color: head ? 'FFFFFF' : INK,
        fill: { color: head ? tone : zebra ? CARD : 'FFFFFF' },
        align: i === 0 ? 'left' : 'center',
        valign: 'middle',
      },
    });
    const rows = [t.head.map((h, i) => cell(h, i, true, false)), ...t.rows.map((r, ri) => r.map((v, i) => cell(v, i, false, ri % 2 === 1)))];
    s.addTable(rows as never, {
      x,
      y,
      w,
      colW: [first, ...Array(t.head.length - 1).fill(other)],
      rowH: fit.rowH,
      fontFace: BODY,
      fontSize: fit.font,
      border: { type: 'solid', pt: 0.75, color: LINE },
      margin: [0.03, 0.1, 0.03, 0.1],
      autoPage: false,
    } as never);
    return fit.height;
  };

  for (const sl of slides) {
    const s = pptx.addSlide();
    if (sl.kind === 'title') {
      s.background = { color: NAVY };
      s.addShape('ellipse', { x: 10.6, y: -1.2, w: 4.5, h: 4.5, fill: { color: NAVY_2 }, line: { color: NAVY_2 } });
      s.addShape('ellipse', { x: 11.8, y: 4.6, w: 3.2, h: 3.2, fill: { color: NAVY_2 }, line: { color: NAVY_2 } });
      text(s, sl.kicker, { x: 0.9, y: 2.0, w: 8, h: 0.5, fontSize: 18, bold: true, color: ICE, charSpacing: 2 });
      text(s, sl.title, { x: 0.9, y: 2.5, w: 10.5, h: 1.1, fontSize: 46, bold: true, color: 'FFFFFF', fontFace: HEAD, valign: 'middle' });
      text(s, sl.sections, { x: 0.9, y: 3.6, w: 10.5, h: 0.5, fontSize: 18, color: ICE });
      s.addShape('line', { x: 0.9, y: 4.2, w: 2.2, h: 0, line: { color: ICE, width: 2 } });
      text(s, sl.intro, { x: 0.9, y: 5.6, w: 10.2, h: 1, fontSize: 12.5, color: ICE });
      continue;
    }
    if (sl.kind === 'overview') {
      s.background = { color: NAVY };
      text(s, sl.title, { x: 0.6, y: 0.5, w: 12, h: 0.6, fontSize: 26, bold: true, color: 'FFFFFF', fontFace: HEAD, valign: 'middle' });
      const bars = sl.bars.filter((b) => b.pct !== null);
      if (bars.length) {
        s.addChart('bar', [{ name: 'Achieved %', labels: bars.map((b) => b.label), values: bars.map((b) => b.pct as number) }], {
          x: 0.8,
          y: 1.4,
          w: 6.8,
          h: 4.6,
          barDir: 'col',
          chartColors: [TONE_COLOR.prod, TONE_COLOR.qc, TONE_COLOR.vis].slice(0, bars.length),
          showValue: true,
          dataLabelPosition: 'outEnd',
          dataLabelFormatCode: '0"%"',
          dataLabelColor: 'FFFFFF',
          dataLabelFontSize: 14,
          dataLabelFontBold: true,
          catAxisLabelColor: ICE,
          catAxisLabelFontSize: 13,
          valAxisLabelColor: ICE,
          valAxisLabelFontSize: 10,
          valAxisMinVal: 0,
          valGridLine: { color: '3A4488', size: 0.5 },
          catGridLine: { style: 'none' },
          showLegend: false,
          showTitle: true,
          title: 'Achieved % vs Target',
          titleColor: 'FFFFFF',
          titleFontSize: 14,
          barGapWidthPct: 60,
          varyColors: true,
        } as never);
      }
      s.addShape('roundRect', { x: 7.9, y: 1.4, w: 5, h: 4.6, fill: { color: NAVY_2 }, line: { color: NAVY_2 }, rectRadius: 0.1 });
      text(s, sl.boxTitle, { x: 8.25, y: 1.7, w: 4.3, h: 0.4, fontSize: 15, bold: true, color: ICE });
      text(s, sl.total, { x: 8.25, y: 2.1, w: 4.3, h: 0.8, fontSize: 38, bold: true, color: 'FFFFFF', valign: 'middle' });
      text(s, sl.totalLabel, { x: 8.25, y: 2.9, w: 4.3, h: 0.4, fontSize: 12.5, color: ICE });
      s.addShape('line', { x: 8.25, y: 3.4, w: 4.3, h: 0, line: { color: '3A4488', width: 1 } });
      text(s, sl.lines.join('\n'), { x: 8.25, y: 3.55, w: 4.3, h: 1.0, fontSize: 14, bold: true, color: 'FFFFFF' });
      text(s, sl.note, { x: 8.25, y: 4.7, w: 4.3, h: 1.1, fontSize: 11.5, color: ICE });
      if (sl.foot) text(s, sl.foot, { x: 0.6, y: 7.05, w: 8, h: 0.35, fontSize: 11, color: ICE });
      continue;
    }
    if (sl.kind === 'highlights') {
      s.background = { color: 'FFFFFF' };
      s.addShape('rect', { x: 0, y: 0, w: 13.333, h: 1.5, fill: { color: NAVY }, line: { color: NAVY } });
      text(s, sl.title, { x: 0.5, y: 0.35, w: 10, h: 0.7, fontSize: 30, bold: true, color: 'FFFFFF', fontFace: HEAD, valign: 'middle' });
      text(s, sl.sub, { x: 0.5, y: 0.98, w: 10, h: 0.4, fontSize: 13, color: ICE, valign: 'middle' });
      sl.items.forEach((it, i) => {
        const y = 1.85 + i * 1.0;
        const c = TONE_COLOR[it.tone];
        s.addShape('roundRect', { x: 0.5, y, w: 0.5, h: 0.5, fill: { color: c }, line: { color: c }, rectRadius: 0.08 });
        text(s, it.letter, { x: 0.5, y, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
        text(s, it.label, { x: 1.2, y: y - 0.02, w: 2.0, h: 0.5, fontSize: 14.5, bold: true, color: c, valign: 'middle' });
        text(s, it.text, { x: 3.35, y: y - 0.06, w: 9.45, h: 0.85, fontSize: 12.5, color: INK });
      });
      footer(s, sl.foot);
      continue;
    }
    const tone = TONE_COLOR[sl.tone];
    header(s, tone, sl.tag, sl.title, sl.sub);
    if (sl.kind === 'section') {
      const xs = [0.5, 3.5, 6.5, 9.5];
      sl.stats.forEach((st, i) => {
        const w = i === 3 ? 3.3 : 2.85;
        const c = i === 3 ? RED : tone;
        s.addShape('roundRect', { x: xs[i], y: 2.0, w, h: 2.0, fill: { color: CARD }, line: { color: LINE }, rectRadius: 0.08 });
        s.addShape('rect', { x: xs[i] + 0.2, y: 2.22, w: w - 0.4, h: 0.05, fill: { color: c }, line: { color: c } });
        text(s, st.value, { x: xs[i] + 0.15, y: 2.35, w: w - 0.3, h: 1.1, fontSize: 30, bold: true, color: c, valign: 'middle' });
        text(s, st.label, { x: xs[i] + 0.2, y: 3.45, w: w - 0.4, h: 0.5, fontSize: 11, color: INK });
      });
      table(s, sl.table, tone, 0.5, 4.4, 8, 2.4);
      text(s, sl.note, { x: 8.85, y: 4.55, w: 4, h: 2.0, fontSize: 12, color: MUTED });
    } else if (sl.kind === 'blocks') {
      let y = 1.95;
      if (sl.lead) {
        text(s, sl.lead, { x: 0.5, y: 1.85, w: 12.3, h: 0.5, fontSize: 13, color: INK });
        y = 2.45;
      }
      const per = (6.8 - y) / Math.max(1, sl.blocks.length);
      for (const b of sl.blocks) {
        let top = y;
        if (b.heading) {
          text(s, b.heading, { x: 0.5, y: top, w: 10, h: 0.4, fontSize: 15, bold: true, color: NAVY, fontFace: HEAD, valign: 'middle' });
          top += 0.45;
        }
        const wide = b.table.head.length > 2;
        const avail = y + per - top - (wide && b.note ? 0.55 : 0.1);
        const h = table(s, b.table, tone, 0.5, top, wide ? 12.3 : 7.6, avail);
        if (b.note) {
          if (wide) text(s, b.note, { x: 0.5, y: top + h + 0.12, w: 12.3, h: 0.45, fontSize: 12, color: MUTED });
          else text(s, b.note, { x: 8.35, y: top + 0.05, w: 4.45, h: Math.max(0.6, h), fontSize: 12, color: MUTED });
        }
        y += per;
      }
    } else if (sl.kind === 'text') {
      text(s, sl.body, { x: 0.5, y: 2.0, w: 12.3, h: 0.7, fontSize: 13.5, color: INK });
      const n = sl.cards.length;
      const gap = 0.2;
      const cw = n ? (12.3 - gap * (n - 1)) / n : 0;
      sl.cards.forEach((c, i) => {
        const x = 0.5 + i * (cw + gap);
        s.addShape('roundRect', { x, y: 2.85, w: cw, h: 3.2, fill: { color: CARD }, line: { color: LINE }, rectRadius: 0.08 });
        text(s, c.title, { x: x + 0.35, y: 3.15, w: cw - 0.7, h: 0.4, fontSize: 16, bold: true, color: tone });
        text(s, c.body, { x: x + 0.35, y: 3.65, w: cw - 0.7, h: 1.4, fontSize: 13, color: INK });
        if (c.badge.trim()) {
          const bw = Math.max(1.2, 0.3 + c.badge.length * 0.12);
          const bc = badgeColor(c.badge);
          s.addShape('roundRect', { x: x + 0.35, y: 5.2, w: bw, h: 0.4, fill: { color: bc }, line: { color: bc }, rectRadius: 0.08 });
          text(s, c.badge, { x: x + 0.35, y: 5.2, w: bw, h: 0.4, fontSize: 11, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
        }
      });
    }
    footer(s, sl.foot);
  }
  await pptx.writeFile({ fileName });
}
