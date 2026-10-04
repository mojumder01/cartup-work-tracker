/**
 * Editable PowerPoint (.pptx) version of the Product Governance report.
 * Every title, number and note is a normal PowerPoint text box / table, so the
 * file can be edited by hand after downloading. Loaded only when clicked.
 */
import type { Cell, ReportBlock } from './governanceReport';

export interface PptxInput {
  fileName: string;
  title: string;
  summary: string;
  blocks: ReportBlock[];
  notes: string[];
  glance: { title: string; items: { label: string; prev: number | null; cur: number | null; text?: string }[]; footer: string } | null;
  footer: string;
}

const MAROON = '6B1530';
const MAROON_2 = '8A2343';
const ROSE = 'FBF2F4';
const ROSE_2 = 'F3DCE3';
const TEAL = '1F8A8A';
const GREEN = '1E7B3C';
const RED = 'B42318';

const W = 13.333;
const H = 7.5;
const M = 0.35;
const ROW = 0.24;
const fmt = (v: Cell) => (v === null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('en-US') : v);

/** First-column width and the width of the other columns, in inches. */
function colWidths(n: number, width: number): [number, number] {
  const first = n <= 2 ? width * 0.6 : n >= 8 ? width * 0.22 : width * 0.3;
  return [first, (width - first) / Math.max(n - 1, 1)];
}

/** Lines a 9 pt text needs in a cell of `w` inches (≈0.068 in per character). */
const wrapLines = (t: string, w: number) => Math.max(1, Math.ceil((t.length * 0.068) / Math.max(w - 0.08, 0.3)));

/** Block height in inches (title + header + rows incl. wrapped names + note). */
function blockHeight(b: ReportBlock, width: number): number {
  const [first, other] = colWidths(b.head.length, width);
  const titleLines = wrapLines(b.title + (b.tag ? ` · ${b.tag}` : ''), width * 0.85);
  const headLines = Math.max(...b.head.map((h, i) => h.split('\n').reduce((z, part) => z + wrapLines(part, i === 0 ? first : other), 0)));
  const body = [...(b.rows.length ? b.rows : [['']]), ...(b.total ? [b.total] : [])].reduce((z, r) => z + Math.max(ROW, wrapLines(fmt(r[0]), first) * 0.165 + 0.07), 0);
  const noteLines = b.note ? wrapLines(b.note, width) + b.note.split('\n').length - 1 : 0;
  return titleLines * 0.22 + 0.1 + headLines * 0.16 + 0.1 + body + (noteLines ? noteLines * 0.17 + 0.12 : 0) + 0.14;
}

export async function downloadGovernancePptx(input: PptxInput): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = input.title;
  pptx.company = 'Cartup';

  const glanceW = input.glance ? 2.55 : 0;
  const contentW = W - 2 * M - (glanceW ? glanceW + 0.2 : 0);
  const colW = (contentW - 0.2) / 2;
  const footerY = H - 0.38;

  type Slide = ReturnType<typeof pptx.addSlide>;
  let slide: Slide;
  let top = 0;
  let cols: number[] = [];

  const newSlide = (first: boolean) => {
    slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(first ? input.title : `${input.title} (continued)`, { x: M, y: 0.2, w: W - 2 * M - 1.4, h: 0.5, fontSize: 24, bold: true, color: MAROON, fontFace: 'Calibri' });
    slide.addText([
      { text: 'cart', options: { color: MAROON, bold: true } },
      { text: 'up', options: { color: 'E8A33D', bold: true } },
    ], { x: W - M - 1.3, y: 0.2, w: 1.3, h: 0.5, fontSize: 22, align: 'right' });
    slide.addShape(pptx.ShapeType.line, { x: M, y: 0.74, w: W - 2 * M, h: 0, line: { color: 'E8A33D', width: 2 } });
    top = 0.88;
    if (first && input.summary) {
      const lines = Math.ceil((input.summary.length * 0.085) / (W - 2 * M)) || 1;
      const h = lines * 0.22 + 0.08;
      slide.addText(`❖ ${input.summary}`, { x: M, y: top, w: W - 2 * M, h, fontSize: 12, color: '333333', italic: true, valign: 'top' });
      top += h + 0.08;
    }
    if (input.glance) {
      const g = input.glance;
      const gx = W - M - glanceW;
      slide.addShape(pptx.ShapeType.rect, { x: gx, y: top, w: glanceW, h: footerY - top - 0.08, fill: { color: MAROON }, line: { color: MAROON } });
      if (first) {
        const parts: { text: string; options: Record<string, unknown> }[] = [
          { text: g.title, options: { fontSize: 16, bold: true, breakLine: true } },
          { text: 'At a Glance', options: { fontSize: 11, color: 'F3C77A', breakLine: true } },
          { text: ' ', options: { fontSize: 6, breakLine: true } },
        ];
        for (const it of g.items) {
          const both = it.prev !== null && it.cur !== null;
          const ch = both && it.prev ? ((it.cur! - it.prev!) / it.prev!) * 100 : null;
          parts.push({ text: it.label, options: { fontSize: 10, color: 'F3DCE3', breakLine: true } });
          parts.push({ text: it.text ?? `${fmt(it.prev ?? 0)} → ${fmt(it.cur ?? 0)}`, options: { fontSize: it.text ? 11.5 : 13, bold: true } });
          parts.push({
            text: !both ? '' : ch === null || it.cur === it.prev ? (it.cur === it.prev ? '  • 0.0%' : '') : `  ${ch > 0 ? '▲ +' : '▼ '}${ch.toFixed(1)}%`,
            options: { fontSize: 10, color: ch !== null && it.cur! > it.prev! ? '8FE3A8' : 'FFB4A8', breakLine: true },
          });
          parts.push({ text: ' ', options: { fontSize: 5, breakLine: true } });
        }
        parts.push({ text: g.footer, options: { fontSize: 9, color: 'F3DCE3' } });
        slide.addText(parts as never, { x: gx + 0.15, y: top + 0.1, w: glanceW - 0.3, h: footerY - top - 0.3, color: 'FFFFFF', valign: 'top', fontFace: 'Calibri' });
      }
    }
    slide.addText(input.footer, { x: M, y: footerY, w: W - 2 * M, h: 0.3, fontSize: 9, color: '777777', align: 'center' });
    cols = [top, top];
  };

  const place = (h: number): { x: number; y: number } => {
    let i = cols[0] <= cols[1] ? 0 : 1;
    if (cols[i] + h > footerY - 0.05) {
      const j = 1 - i;
      if (cols[j] + h <= footerY - 0.05) i = j;
      else if (cols[0] > top + 0.01 || cols[1] > top + 0.01) {
        newSlide(false);
        i = 0;
      }
    }
    const y = cols[i];
    cols[i] += h;
    return { x: M + i * (colW + 0.2), y };
  };

  newSlide(true);

  for (const b of input.blocks) {
    const h = blockHeight(b, colW);
    const { x, y } = place(h);
    const title = b.tag ? `${b.title} · ${b.tag}` : b.title;
    const titleH = wrapLines(title, colW * 0.85) * 0.22 + 0.1;
    slide!.addText(title, { x, y, w: colW, h: titleH, fontSize: 12, bold: true, color: 'FFFFFF', fill: { color: MAROON }, margin: [2, 6, 2, 6], fontFace: 'Calibri' });
    const n = b.head.length;
    const [first, other] = colWidths(n, colW);
    const cell = (v: Cell, i: number, isDelta: boolean, bold = false) => {
      const color = isDelta && typeof v === 'number' ? (v > 0 ? GREEN : v < 0 ? RED : '333333') : isDelta && v === 'New' ? TEAL : '222222';
      const text = isDelta && typeof v === 'number' && v > 0 ? `+${fmt(v)}` : fmt(v);
      return { text, options: { align: i === 0 ? 'left' : 'center', color, bold: bold || (isDelta && v !== null) } };
    };
    const rows: unknown[] = [
      b.head.map((t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: MAROON_2 }, align: 'center', valign: 'middle' } })),
      ...(b.rows.length ? b.rows : [[`No entries in these periods`, ...Array(n - 1).fill('')]]).map((r, ri) =>
        r.map((v, i) => ({ ...cell(v, i, b.deltaCol && i === n - 1), options: { ...cell(v, i, b.deltaCol && i === n - 1).options, fill: { color: ri % 2 ? ROSE : 'FFFFFF' } } })),
      ),
      ...(b.total ? [b.total.map((v, i) => ({ ...cell(v, i, b.deltaCol && i === n - 1, true), options: { ...cell(v, i, b.deltaCol && i === n - 1, true).options, fill: { color: ROSE_2 } } }))] : []),
      // The note is the table's last row (one merged cell), so it always sits right under the table.
      ...(b.note ? [[{ text: b.note, options: { colspan: n, italic: true, color: '444444', fill: { color: ROSE }, align: 'left' } }]] : []),
    ];
    slide!.addTable(rows as never, {
      x,
      y: y + titleH,
      w: colW,
      colW: [first, ...Array(n - 1).fill(other)],
      fontSize: 9,
      fontFace: 'Calibri',
      border: { type: 'solid', pt: 0.5, color: ROSE_2 },
      margin: 0.03,
      // Per-row heights so a long note or a wrapped name gets its full height.
      rowH: [
        Math.max(...b.head.map((h) => h.split('\n').length)) * 0.16 + 0.1,
        ...(b.rows.length ? b.rows : [['']]).map((r) => Math.max(ROW, wrapLines(fmt(r[0]), first) * 0.165 + 0.07)),
        ...(b.total ? [ROW] : []),
        ...(b.note ? [wrapLines(b.note, colW) * 0.17 + 0.12 + 0.17 * (b.note.split('\n').length - 1)] : []),
      ],
      autoPage: false,
    });
  }

  if (input.notes.length) {
    const text = input.notes.map((t) => `• ${t}`).join('\n');
    const lines = input.notes.reduce((z, t) => z + Math.ceil((t.length * 0.08) / colW), 0);
    const h = 0.36 + lines * 0.19 + 0.1;
    const { x, y } = place(h + 0.1);
    slide!.addText(
      [
        { text: '🔑 Key Notes', options: { bold: true, fontSize: 12, color: MAROON, breakLine: true } },
        { text, options: { fontSize: 9.5, color: '333333' } },
      ],
      { x, y, w: colW, h, fill: { color: ROSE }, valign: 'top', margin: [4, 8, 4, 8], line: { color: TEAL, width: 0 } },
    );
    slide!.addShape(pptx.ShapeType.rect, { x, y, w: 0.06, h, fill: { color: TEAL }, line: { color: TEAL } });
  }

  await pptx.writeFile({ fileName: input.fileName });
}
