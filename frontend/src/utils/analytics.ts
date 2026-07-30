/**
 * Shared reporting maths over archived report cards + the live current month.
 *
 * Past months are compacted into monthly_archives on rollover and their raw
 * transactions deleted, so per-category history comes from archives only —
 * the current month is the sole month with live transaction rows.
 */

import type { MonthTotals } from '../components/MonthlyComparisonChart';
import type { BudgetAllocationView, ReportArchiveMonth, Transaction } from '../types';

/** How many completed months the backend retains (plus the live current one). */
export const RETAINED_MONTHS = 6;

const now = new Date();
export const CURRENT_YEAR = now.getFullYear();
export const CURRENT_MONTH = now.getMonth() + 1;
export const CURRENT_KEY = `${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, '0')}`;

export const monthLabel = (year: number, month: number, style: 'short' | 'long' = 'long') =>
  new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: style === 'long' ? 'long' : 'short',
    ...(style === 'long' ? { year: 'numeric' } : {}),
  });

/** Chronological index used to order and compare (year, month) pairs. */
const monthIndex = (year: number, month: number) => year * 12 + month;

/**
 * Archives, oldest first, limited to the retention window. The backend prunes
 * anything older, but a stale response could still carry extra months.
 */
export const recentArchives = (archives: ReportArchiveMonth[]): ReportArchiveMonth[] => {
  const currentIdx = monthIndex(CURRENT_YEAR, CURRENT_MONTH);
  return archives
    .filter((a) => {
      const age = currentIdx - monthIndex(a.year, a.month);
      return age >= 1 && age <= RETAINED_MONTHS;
    })
    .sort((a, b) => monthIndex(a.year, a.month) - monthIndex(b.year, b.month));
};

/** Budgeted/spent totals per month: archived months then the live current one. */
export const buildMonthSeries = (
  archives: ReportArchiveMonth[],
  allocations: BudgetAllocationView[],
  currentTransactions: Transaction[]
): MonthTotals[] => {
  const past = recentArchives(archives).map((a) => ({
    label: monthLabel(a.year, a.month, 'short'),
    fullLabel: monthLabel(a.year, a.month),
    budgeted: a.categories.reduce((s, c) => s + c.max_budget, 0),
    spent: a.categories.reduce((s, c) => s + c.total_spent, 0),
  }));

  return [
    ...past,
    {
      label: monthLabel(CURRENT_YEAR, CURRENT_MONTH, 'short'),
      fullLabel: monthLabel(CURRENT_YEAR, CURRENT_MONTH),
      budgeted: allocations.reduce((s, a) => s + a.max_budget, 0),
      spent: currentTransactions.reduce((s, t) => s + t.amount, 0),
      isCurrent: true,
    },
  ];
};

export interface SpendingTrend {
  /** Dollar change in monthly spending per month (positive = rising). */
  slope: number;
  /** Linear projection of next month's total spending. */
  prediction: number;
  pctPerMonth: number;
  monthsUsed: number;
}

/**
 * Least-squares fit over completed months' spending. The current month is
 * excluded — it is still partial, so including it would bias the slope down.
 * Returns null until two completed months exist.
 */
export const computeTrend = (months: MonthTotals[]): SpendingTrend | null => {
  const past = months.filter((m) => !m.isCurrent);
  if (past.length < 2) return null;

  const ys = past.map((m) => m.spent);
  const n = ys.length;
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((s, y) => s + y, 0) / n;

  let cov = 0;
  let variance = 0;
  ys.forEach((y, x) => {
    cov += (x - xMean) * (y - yMean);
    variance += (x - xMean) ** 2;
  });

  const slope = variance > 0 ? cov / variance : 0;
  const intercept = yMean - slope * xMean;

  return {
    slope,
    prediction: Math.max(intercept + slope * n, 0),
    pctPerMonth: yMean > 0 ? (slope / yMean) * 100 : 0,
    monthsUsed: n,
  };
};

/** Per-category spend for a month, largest first. */
export const categorySpend = (
  archive: ReportArchiveMonth | null,
  currentTransactions: Transaction[]
): Array<{ name: string; amount: number }> => {
  const totals = new Map<string, number>();

  if (archive) {
    archive.categories.forEach((c) => {
      if (c.total_spent > 0) {
        totals.set(c.category_name, (totals.get(c.category_name) || 0) + c.total_spent);
      }
    });
  } else {
    currentTransactions.forEach((t) => {
      const name = t.category_name || 'Uncategorised';
      totals.set(name, (totals.get(name) || 0) + t.amount);
    });
  }

  return Array.from(totals.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
};
