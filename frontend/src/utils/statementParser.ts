/**
 * Bank statement parsing: turns a CSV or PDF statement into normalised lines,
 * then groups them into detected income streams, recurring expenses and
 * one-time expenses for the import review screen.
 */

export interface StatementLine {
  id: number;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // always positive
  kind: 'credit' | 'debit';
}

export interface StatementGroup {
  key: string;
  /** Cleaned display name (statement reference). */
  name: string;
  lines: StatementLine[];
  total: number;
}

export interface ParsedStatement {
  lines: StatementLine[];
  warnings: string[];
}

let nextId = 1;
const lineId = () => nextId++;

// ---------------------------------------------------------------------------
// Date handling
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Parse common statement date formats into YYYY-MM-DD (DD/MM assumed, AU-style). */
export const normaliseDate = (raw: string): string | null => {
  const s = raw.trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // DD/MM/YYYY
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
    return null;
  }

  m = s.match(/^(\d{1,2})[ /-]([A-Za-z]{3,})[ /-]?(\d{2,4})?$/); // 12 Jun 2026 / 12 Jun
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    let y = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    if (y < 100) y += 2000;
    if (mo && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
  }

  return null;
};

// ---------------------------------------------------------------------------
// Amount handling
// ---------------------------------------------------------------------------

/** Parse "$1,234.56", "-12.00", "(45.00)" → signed number, or null. */
const parseAmount = (raw: string): number | null => {
  let s = raw.trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (s.startsWith('+')) s = s.slice(1);
  s = s.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const v = parseFloat(s);
  if (isNaN(v)) return null;
  return negative ? -v : v;
};

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

const splitCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
};

const findColumn = (header: string[], needles: string[]): number =>
  header.findIndex((h) => needles.some((n) => h.includes(n)));

/**
 * Parse a bank CSV. Understands either a signed Amount column (negative =
 * money out) or separate Debit/Credit columns. Headerless CSVs are handled
 * by assuming date,description,amount order.
 */
export const parseCsvStatement = (text: string): ParsedStatement => {
  const warnings: string[] = [];
  const rows = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map(splitCsvLine);

  if (rows.length === 0) return { lines: [], warnings: ['The file is empty.'] };

  const headerRaw = rows[0].map((h) => h.toLowerCase());
  const hasHeader = headerRaw.some((h) =>
    ['date', 'description', 'amount', 'debit', 'credit', 'narrative', 'details'].some((k) => h.includes(k))
  );

  let dateIdx = 0;
  let descIdx = 1;
  let amountIdx = 2;
  let debitIdx = -1;
  let creditIdx = -1;
  let dataRows = rows;

  if (hasHeader) {
    dataRows = rows.slice(1);
    dateIdx = findColumn(headerRaw, ['date']);
    descIdx = findColumn(headerRaw, ['description', 'narrative', 'details', 'transaction', 'payee', 'memo']);
    amountIdx = findColumn(headerRaw, ['amount']);
    debitIdx = findColumn(headerRaw, ['debit', 'withdrawal', 'money out']);
    creditIdx = findColumn(headerRaw, ['credit', 'deposit', 'money in']);
    if (dateIdx === -1 || descIdx === -1 || (amountIdx === -1 && debitIdx === -1 && creditIdx === -1)) {
      return {
        lines: [],
        warnings: ['Could not find Date, Description and Amount (or Debit/Credit) columns in the CSV header.'],
      };
    }
  }

  const lines: StatementLine[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    const date = normaliseDate(row[dateIdx] || '');
    const description = (row[descIdx] || '').trim();
    if (!date || !description) {
      skipped++;
      continue;
    }

    let amount: number | null = null;
    if (debitIdx !== -1 || creditIdx !== -1) {
      const debit = debitIdx !== -1 ? parseAmount(row[debitIdx] || '') : null;
      const credit = creditIdx !== -1 ? parseAmount(row[creditIdx] || '') : null;
      if (debit && debit !== 0) amount = -Math.abs(debit);
      else if (credit && credit !== 0) amount = Math.abs(credit);
    } else {
      amount = parseAmount(row[amountIdx] || '');
    }

    if (amount === null || amount === 0) {
      skipped++;
      continue;
    }

    lines.push({
      id: lineId(),
      date,
      description,
      amount: Math.abs(amount),
      kind: amount > 0 ? 'credit' : 'debit',
    });
  }

  if (skipped > 0) warnings.push(`${skipped} row(s) could not be parsed and were skipped.`);
  return { lines, warnings };
};

// ---------------------------------------------------------------------------
// PDF parsing (best effort — layouts vary between banks)
// ---------------------------------------------------------------------------

export const parsePdfStatement = async (file: File): Promise<ParsedStatement> => {
  const pdfjs = await import('pdfjs-dist');
  // @ts-ignore - worker entry has no type declarations
  const worker = await import('pdfjs-dist/build/pdf.worker.entry');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;

  // Rebuild text rows from positioned glyph runs (group by y per page)
  const textRows: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x, str: item.str });
    }
    const ys = Array.from(byY.keys()).sort((a, b) => b - a); // top to bottom
    for (const y of ys) {
      const row = byY
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (row) textRows.push(row);
    }
  }

  const warnings: string[] = [];
  const lines: StatementLine[] = [];

  // A transaction row: starts with a date, ends with 1-2 money values
  // (amount, and often a running balance we ignore).
  const datePattern =
    /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2} [A-Za-z]{3,9}(?: \d{2,4})?)\s+(.*)$/;
  const moneyPattern = /\(?-?\+?\$?[\d,]+\.\d{2}\)?(?:\s?(?:CR|DR|cr|dr))?/g;

  for (const row of textRows) {
    const dm = row.match(datePattern);
    if (!dm) continue;
    const date = normaliseDate(dm[1]);
    if (!date) continue;

    const rest = dm[2];
    const monies = rest.match(moneyPattern);
    if (!monies || monies.length === 0) continue;

    // If two or more trailing values, the last is usually the running
    // balance — the transaction amount is the one before it.
    const amountToken = monies.length >= 2 ? monies[monies.length - 2] : monies[monies.length - 1];
    const isCredit = /cr\s*$/i.test(amountToken);
    const cleaned = amountToken.replace(/\s?(CR|DR|cr|dr)\s*$/, '');
    const value = parseAmount(cleaned);
    if (value === null || value === 0) continue;

    // Description = text before the first money value
    const firstMoneyIdx = rest.indexOf(monies[0]);
    const description = rest.slice(0, firstMoneyIdx).trim().replace(/\s+/g, ' ');
    if (!description) continue;

    lines.push({
      id: lineId(),
      date,
      description,
      amount: Math.abs(value),
      // Explicit CR marker → credit; otherwise default to debit (see warning)
      kind: isCredit ? 'credit' : 'debit',
    });
  }

  // PDF sign information is often ambiguous: without CR/DR markers most rows
  // parse as debits. Flag that so the review UI explains the switch buttons.
  const credits = lines.filter((l) => l.kind === 'credit').length;
  if (lines.length > 0 && credits === 0) {
    warnings.push(
      'Amount signs are not always available in PDFs — everything was classified as an expense. Use "Treat as income" on any deposits.'
    );
  }
  if (lines.length === 0) {
    warnings.push(
      'No transactions could be extracted from this PDF. If it is a scanned image, export a CSV from your bank instead.'
    );
  }

  return { lines, warnings };
};

// ---------------------------------------------------------------------------
// Grouping & income-stream detection
// ---------------------------------------------------------------------------

/** Normalise a statement reference for grouping (strip refs/dates/amounts). */
export const groupKey = (description: string): string =>
  description
    .toUpperCase()
    .replace(/\d+/g, '')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ');

export const groupLines = (lines: StatementLine[]): StatementGroup[] => {
  const groups = new Map<string, StatementGroup>();
  for (const line of lines) {
    const key = groupKey(line.description) || line.description.toUpperCase();
    if (!groups.has(key)) {
      groups.set(key, { key, name: line.description, lines: [], total: 0 });
    }
    const g = groups.get(key)!;
    g.lines.push(line);
    g.total += line.amount;
    // Prefer the shortest raw description as the display/reference name
    if (line.description.length < g.name.length) g.name = line.description;
  }
  return Array.from(groups.values()).sort((a, b) => b.total - a.total);
};

/** Guess an income frequency from deposit dates. */
export const guessFrequency = (dates: string[]): string => {
  if (dates.length <= 1) return 'One-off';
  const sorted = [...dates].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i - 1]).getTime();
    const b = new Date(sorted[i]).getTime();
    gaps.push((b - a) / 86400000);
  }
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (avg <= 10) return 'Weekly';
  if (avg <= 21) return 'Fortnightly';
  if (avg <= 45) return 'Monthly';
  if (avg <= 200) return 'Yearly';
  return 'One-off';
};
