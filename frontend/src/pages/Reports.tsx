import React, { useEffect, useMemo, useState } from 'react';
import MainLayout from '../components/MainLayout';
import CategoryDonut, { buildSlices } from '../components/CategoryDonut';
import MonthlyComparisonChart, { type MonthTotals } from '../components/MonthlyComparisonChart';
import {
  getAllocations,
  getTransactions,
  getReportArchives,
  getReportCsv,
  getApiErrorMessage,
} from '../services/api';
import type { BudgetAllocationView, ReportArchiveMonth, Transaction } from '../types';

interface CategoryBreakdown {
  category_name: string;
  budgeted: number;
  spent: number;
  percentage: number;
}

interface ReportsProps {
  username: string;
  onLogout: () => void;
  onNavigate: (page: 'dashboard' | 'csv-import' | 'reports' | 'profile') => void;
}

const monthLabel = (year: number, month: number, style: 'short' | 'long' = 'long') =>
  new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: style === 'long' ? 'long' : 'short',
    ...(style === 'long' ? { year: 'numeric' } : {}),
  });

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_KEY = `${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, '0')}`;

const downloadFile = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const Reports: React.FC<ReportsProps> = ({ username, onLogout, onNavigate }) => {
  const [archives, setArchives] = useState<ReportArchiveMonth[]>([]);
  const [allocations, setAllocations] = useState<BudgetAllocationView[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<string>('current');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        // getReportArchives also triggers month-start archival server-side,
        // so fetch it first — transactions/allocations then reflect the clean state.
        const arch = await getReportArchives();
        const [allocs, txns] = await Promise.all([getAllocations(), getTransactions()]);
        setArchives(arch);
        setAllocations(allocs);
        setTransactions(txns.filter((t) => t.date.startsWith(CURRENT_KEY)));
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to load report data.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---- Selected month breakdown -------------------------------------------
  const selectedArchive = useMemo(
    () =>
      selected === 'current'
        ? null
        : archives.find((a) => `${a.year}-${a.month}` === selected) || null,
    [selected, archives]
  );

  const breakdown = useMemo((): CategoryBreakdown[] => {
    let rows: Array<{ name: string; budgeted: number; spent: number }>;
    if (selectedArchive) {
      rows = selectedArchive.categories.map((c) => ({
        name: c.category_name,
        budgeted: c.max_budget,
        spent: c.total_spent,
      }));
    } else {
      const spentBy = new Map<string, number>();
      transactions.forEach((t) => {
        const name = t.category_name || 'Uncategorised';
        spentBy.set(name, (spentBy.get(name) || 0) + t.amount);
      });
      const names = new Set([...allocations.map((a) => a.category_name), ...spentBy.keys()]);
      rows = Array.from(names).map((name) => ({
        name,
        budgeted: allocations
          .filter((a) => a.category_name === name)
          .reduce((s, a) => s + a.max_budget, 0),
        spent: spentBy.get(name) || 0,
      }));
    }
    return rows
      .filter((r) => r.budgeted > 0 || r.spent > 0)
      .map((r) => ({
        category_name: r.name,
        budgeted: r.budgeted,
        spent: r.spent,
        percentage: r.budgeted > 0 ? (r.spent / r.budgeted) * 100 : r.spent > 0 ? 100 : 0,
      }))
      .sort((a, b) => b.spent - a.spent);
  }, [selectedArchive, allocations, transactions]);

  const totalBudgeted = breakdown.reduce((s, c) => s + c.budgeted, 0);
  const totalSpent = breakdown.reduce((s, c) => s + c.spent, 0);
  const netSavings = totalBudgeted - totalSpent;

  const slices = useMemo(
    () =>
      buildSlices(
        breakdown.filter((c) => c.spent > 0).map((c) => [c.category_name, c.spent]),
        totalSpent
      ),
    [breakdown, totalSpent]
  );

  // ---- Month-over-month comparison ----------------------------------------
  const comparisonMonths = useMemo((): MonthTotals[] => {
    const past = [...archives]
      .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))
      .map((a) => ({
        label: monthLabel(a.year, a.month, 'short'),
        fullLabel: monthLabel(a.year, a.month),
        budgeted: a.categories.reduce((s, c) => s + c.max_budget, 0),
        spent: a.categories.reduce((s, c) => s + c.total_spent, 0),
      }));
    const currentBudgeted = allocations.reduce((s, a) => s + a.max_budget, 0);
    const currentSpent = transactions.reduce((s, t) => s + t.amount, 0);
    return [
      ...past,
      {
        label: monthLabel(CURRENT_YEAR, CURRENT_MONTH, 'short'),
        fullLabel: monthLabel(CURRENT_YEAR, CURRENT_MONTH),
        budgeted: currentBudgeted,
        spent: currentSpent,
        isCurrent: true,
      },
    ];
  }, [archives, allocations, transactions]);

  // ---- Trend analysis & prediction (simple linear projection) -------------
  const trend = useMemo(() => {
    const past = comparisonMonths.filter((m) => !m.isCurrent);
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
    const prediction = Math.max(intercept + slope * n, 0);
    const pctPerMonth = yMean > 0 ? (slope / yMean) * 100 : 0;

    // Biggest category movers between the two most recent archived months
    const [prev, last] = [
      archives.find((a) => monthLabel(a.year, a.month, 'short') === past[past.length - 2].label),
      archives.find((a) => monthLabel(a.year, a.month, 'short') === past[past.length - 1].label),
    ];
    let movers: Array<{ name: string; delta: number }> = [];
    if (prev && last) {
      const prevBy = new Map(prev.categories.map((c) => [c.category_name, c.total_spent]));
      const names = new Set([
        ...prev.categories.map((c) => c.category_name),
        ...last.categories.map((c) => c.category_name),
      ]);
      movers = Array.from(names)
        .map((name) => ({
          name,
          delta:
            (last.categories.find((c) => c.category_name === name)?.total_spent || 0) -
            (prevBy.get(name) || 0),
        }))
        .filter((m) => Math.abs(m.delta) >= 0.01)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 3);
    }

    return { slope, prediction, pctPerMonth, monthsUsed: n, movers };
  }, [comparisonMonths, archives]);

  // ---- Exports -------------------------------------------------------------
  const handleDownloadCsv = async () => {
    try {
      if (selectedArchive) {
        const csv = await getReportCsv(selectedArchive.year, selectedArchive.month);
        downloadFile(
          `budgie-report-${selectedArchive.year}-${String(selectedArchive.month).padStart(2, '0')}.csv`,
          csv,
          'text/csv'
        );
      } else {
        const header = 'Date,Category,Description,Amount\n';
        const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const body = [...transactions]
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((t) => `${t.date},${q(t.category_name || 'Uncategorised')},${q(t.description || '')},${t.amount.toFixed(2)}`)
          .join('\n');
        downloadFile(`budgie-report-${CURRENT_KEY}.csv`, header + body + '\n', 'text/csv');
      }
    } catch (err) {
      alert(getApiErrorMessage(err, 'Could not download the CSV.'));
    }
  };

  const selectedLabel = selectedArchive
    ? monthLabel(selectedArchive.year, selectedArchive.month)
    : monthLabel(CURRENT_YEAR, CURRENT_MONTH);

  return (
    <MainLayout username={username} onLogout={onLogout} onNavigate={onNavigate}>
      <div className="print-area mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header & Controls */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold text-gray-900">Financial Report Card</h1>
          <div className="flex items-center gap-2 print:hidden">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded border border-gray-300 p-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="current">{monthLabel(CURRENT_YEAR, CURRENT_MONTH)} (current)</option>
              {archives.map((a) => (
                <option key={`${a.year}-${a.month}`} value={`${a.year}-${a.month}`}>
                  {monthLabel(a.year, a.month)} (archived)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={selectedArchive ? !selectedArchive.has_csv : transactions.length === 0}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Export PDF
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-lg border border-gray-100 bg-white p-6 shadow">
                  <div className="mb-2 h-4 w-20 rounded bg-gray-200"></div>
                  <div className="h-8 w-32 rounded bg-gray-200"></div>
                </div>
              ))}
            </div>
            <div className="min-h-[300px] animate-pulse rounded-lg border border-gray-100 bg-white p-6 shadow"></div>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-gray-500">
              Showing <span className="font-semibold text-gray-800">{selectedLabel}</span>
              {selectedArchive && ' — archived report card'}
            </p>

            {/* High-Level Metrics */}
            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-lg border border-gray-100 bg-white p-6 shadow">
                <h3 className="text-sm text-gray-500">Budgeted</h3>
                <p className="text-2xl font-bold text-green-600">${totalBudgeted.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-white p-6 shadow">
                <h3 className="text-sm text-gray-500">Total Spent</h3>
                <p className="text-2xl font-bold text-red-600">${totalSpent.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-white p-6 shadow">
                <h3 className="text-sm text-gray-500">Net Savings</h3>
                <p className={`text-2xl font-bold ${netSavings >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  ${netSavings.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Spending distribution pie */}
            <div className="mb-8 rounded-lg border border-gray-100 bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">Spending Distribution</h2>
              {slices.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No spending recorded for this month.
                </p>
              ) : (
                <div className="flex flex-col items-center gap-6 md:flex-row md:justify-center">
                  <CategoryDonut slices={slices} total={totalSpent} />
                  <ul className="w-full max-w-xs space-y-2">
                    {slices.map((slice) => (
                      <li key={slice.name} className="flex items-center justify-between text-sm">
                        <span className="flex min-w-0 items-center gap-2 text-gray-700">
                          <span
                            className="inline-block h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: slice.color }}
                          />
                          <span className="truncate">{slice.name}</span>
                        </span>
                        <span className="shrink-0 pl-3 font-medium text-gray-900">
                          ${slice.amount.toFixed(2)}
                          <span className="ml-1 text-xs font-normal text-gray-500">
                            {(slice.fraction * 100).toFixed(1)}%
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Month-over-month comparison */}
            <div className="mb-8 rounded-lg border border-gray-100 bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">Month-over-Month</h2>
              {comparisonMonths.length <= 1 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  Complete a month of tracking to see comparisons. Report cards are archived
                  automatically at the start of each month (the last 6 are kept).
                </p>
              ) : (
                <MonthlyComparisonChart months={comparisonMonths} />
              )}
            </div>

            {/* Trend analysis & prediction */}
            <div className="mb-8 rounded-lg border border-gray-100 bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">Trends &amp; Prediction</h2>
              {!trend ? (
                <p className="text-sm text-gray-500">
                  Trend analysis needs at least two archived months. Keep tracking — your first
                  report cards will appear here automatically.
                </p>
              ) : (
                <div className="space-y-3 text-sm text-gray-700">
                  <p>
                    Over the last {trend.monthsUsed} archived months your spending has been{' '}
                    <span className={`font-semibold ${trend.slope > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {trend.slope > 0 ? 'rising' : trend.slope < 0 ? 'falling' : 'flat'}
                      {trend.slope !== 0 && ` by about $${Math.abs(trend.slope).toFixed(2)}/month`}
                    </span>
                    {trend.pctPerMonth !== 0 && ` (${trend.pctPerMonth > 0 ? '+' : ''}${trend.pctPerMonth.toFixed(1)}%/month)`}.
                  </p>
                  <p>
                    Simple linear projection for next month:{' '}
                    <span className="font-bold text-gray-900">${trend.prediction.toFixed(2)}</span> total spending.
                  </p>
                  {trend.movers.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-gray-800">Biggest movers last month:</p>
                      <ul className="space-y-1">
                        {trend.movers.map((m) => (
                          <li key={m.name} className="flex items-center gap-2">
                            <span className={m.delta > 0 ? 'text-red-600' : 'text-green-600'}>
                              {m.delta > 0 ? '▲' : '▼'}
                            </span>
                            {m.name}: {m.delta > 0 ? 'up' : 'down'} ${Math.abs(m.delta).toFixed(2)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-xs text-gray-400">
                    Prediction is a simple linear projection of past totals — a guide, not a guarantee.
                  </p>
                </div>
              )}
            </div>

            {/* Category Breakdown */}
            <div className="rounded-lg border border-gray-100 bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">Category Breakdown</h2>
              {breakdown.length > 0 ? (
                <div className="space-y-4">
                  {breakdown.map((category) => (
                    <div key={category.category_name} className="rounded-lg border border-gray-200 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">{category.category_name}</h3>
                        <span className="text-sm text-gray-600">
                          ${category.spent.toFixed(2)} of ${category.budgeted.toFixed(2)}
                        </span>
                      </div>
                      <div className="relative">
                        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={`h-full transition-all ${
                              category.percentage < 50
                                ? 'bg-green-500'
                                : category.percentage < 85
                                ? 'bg-yellow-400'
                                : category.percentage < 100
                                ? 'bg-orange-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(100, category.percentage)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-right text-xs text-gray-500">
                          {category.percentage.toFixed(1)}% used
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-gray-500">
                  No data for this month.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default Reports;
