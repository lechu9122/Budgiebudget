import React, { useEffect, useMemo, useState } from 'react';
import MainLayout from '../components/MainLayout';
import CategoryDonut, { buildSlices } from '../components/CategoryDonut';
import MonthlyComparisonChart from '../components/MonthlyComparisonChart';
import {
  getAllocations,
  getTransactions,
  getReportArchives,
  getReportCsv,
  getApiErrorMessage,
} from '../services/api';
import type { BudgetAllocationView, ReportArchiveMonth, Transaction } from '../types';
import {
  buildMonthSeries,
  computeTrend,
  monthLabel,
  recentArchives,
  CURRENT_KEY,
  CURRENT_MONTH,
  CURRENT_YEAR,
} from '../utils/analytics';

interface CategoryBreakdown {
  category_name: string;
  budgeted: number;
  spent: number;
  percentage: number;
}

interface ReportsProps {
  username: string;
  onLogout: () => void;
}

const downloadFile = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** Quote a CSV field per RFC 4180. */
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

const Reports: React.FC<ReportsProps> = ({ username, onLogout }) => {
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

  const pastMonths = useMemo(() => recentArchives(archives), [archives]);

  // ---- Selected month breakdown -------------------------------------------
  const selectedArchive = useMemo(
    () =>
      selected === 'current'
        ? null
        : pastMonths.find((a) => `${a.year}-${a.month}` === selected) || null,
    [selected, pastMonths]
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

  const overspent = useMemo(
    () => breakdown.filter((c) => c.budgeted > 0 && c.spent > c.budgeted),
    [breakdown]
  );

  const slices = useMemo(
    () =>
      buildSlices(
        breakdown.filter((c) => c.spent > 0).map((c) => [c.category_name, c.spent]),
        totalSpent
      ),
    [breakdown, totalSpent]
  );

  // ---- Month-over-month comparison ----------------------------------------
  const comparisonMonths = useMemo(
    () => buildMonthSeries(archives, allocations, transactions),
    [archives, allocations, transactions]
  );

  // ---- Trend analysis & prediction ----------------------------------------
  const trend = useMemo(() => computeTrend(comparisonMonths), [comparisonMonths]);

  /** Biggest category movers between the two most recent archived months. */
  const movers = useMemo(() => {
    if (pastMonths.length < 2) return [];
    const prev = pastMonths[pastMonths.length - 2];
    const last = pastMonths[pastMonths.length - 1];

    const prevBy = new Map(prev.categories.map((c) => [c.category_name, c.total_spent]));
    const names = new Set([
      ...prev.categories.map((c) => c.category_name),
      ...last.categories.map((c) => c.category_name),
    ]);

    return Array.from(names)
      .map((name) => ({
        name,
        delta:
          (last.categories.find((c) => c.category_name === name)?.total_spent || 0) -
          (prevBy.get(name) || 0),
      }))
      .filter((m) => Math.abs(m.delta) >= 0.01)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);
  }, [pastMonths]);

  const selectedLabel = selectedArchive
    ? monthLabel(selectedArchive.year, selectedArchive.month)
    : monthLabel(CURRENT_YEAR, CURRENT_MONTH);

  const fileStamp = selectedArchive
    ? `${selectedArchive.year}-${String(selectedArchive.month).padStart(2, '0')}`
    : CURRENT_KEY;

  // ---- Exports -------------------------------------------------------------

  /**
   * Budget planner export: each category's budget, what was spent against it,
   * how much of it was used, and whether it went over.
   */
  const handleDownloadPlanner = () => {
    const lines = [
      'BudgieBudget Budget Planner',
      `Month,${q(selectedLabel)}`,
      `Generated,${new Date().toISOString().slice(0, 10)}`,
      '',
      'Category,Budgeted,Spent,Remaining,% Used,Status',
    ];

    breakdown.forEach((c) => {
      const remaining = c.budgeted - c.spent;
      const status =
        c.budgeted <= 0
          ? 'No budget set'
          : c.spent > c.budgeted
          ? `OVER by $${(c.spent - c.budgeted).toFixed(2)}`
          : `Under by $${remaining.toFixed(2)}`;
      lines.push(
        [
          q(c.category_name),
          c.budgeted.toFixed(2),
          c.spent.toFixed(2),
          remaining.toFixed(2),
          `${c.percentage.toFixed(1)}%`,
          q(status),
        ].join(',')
      );
    });

    const overallStatus =
      totalBudgeted <= 0
        ? 'No budget set'
        : totalSpent > totalBudgeted
        ? `OVER by $${(totalSpent - totalBudgeted).toFixed(2)}`
        : `Under by $${netSavings.toFixed(2)}`;

    lines.push(
      '',
      [
        q('TOTAL'),
        totalBudgeted.toFixed(2),
        totalSpent.toFixed(2),
        netSavings.toFixed(2),
        `${totalBudgeted > 0 ? ((totalSpent / totalBudgeted) * 100).toFixed(1) : '0.0'}%`,
        q(overallStatus),
      ].join(',')
    );

    if (overspent.length > 0) {
      lines.push(
        '',
        `Categories over budget,${overspent.length}`,
        ...overspent.map(
          (c) => `${q(c.category_name)},over by,${(c.spent - c.budgeted).toFixed(2)}`
        )
      );
    }

    downloadFile(`budgie-budget-planner-${fileStamp}.csv`, lines.join('\n') + '\n', 'text/csv');
  };

  /** Raw expense lines for the selected month (stored server-side once archived). */
  const handleDownloadTransactions = async () => {
    try {
      if (selectedArchive) {
        const csv = await getReportCsv(selectedArchive.year, selectedArchive.month);
        downloadFile(`budgie-expenses-${fileStamp}.csv`, csv, 'text/csv');
      } else {
        const header = 'Date,Category,Description,Amount\n';
        const body = [...transactions]
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map(
            (t) =>
              `${t.date},${q(t.category_name || 'Uncategorised')},${q(t.description || '')},${t.amount.toFixed(2)}`
          )
          .join('\n');
        downloadFile(`budgie-expenses-${fileStamp}.csv`, header + body + '\n', 'text/csv');
      }
    } catch (err) {
      alert(getApiErrorMessage(err, 'Could not download the expense list.'));
    }
  };

  return (
    <MainLayout username={username} onLogout={onLogout}>
      <div className="print-area mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header & Controls */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold text-gray-900">Financial Report Card</h1>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded border border-gray-300 p-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="current">{monthLabel(CURRENT_YEAR, CURRENT_MONTH)} (current)</option>
              {[...pastMonths].reverse().map((a) => (
                <option key={`${a.year}-${a.month}`} value={`${a.year}-${a.month}`}>
                  {monthLabel(a.year, a.month)} (archived)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleDownloadPlanner}
              disabled={breakdown.length === 0}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="Download your budget, spend and over/under status per category"
            >
              Download Budget Planner
            </button>
            <button
              type="button"
              onClick={handleDownloadTransactions}
              disabled={selectedArchive ? !selectedArchive.has_csv : transactions.length === 0}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Expenses CSV
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

            {overspent.length > 0 && (
              <div className="mb-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <span className="font-semibold">
                  {overspent.length} categor{overspent.length === 1 ? 'y is' : 'ies are'} over budget:
                </span>{' '}
                {overspent
                  .map((c) => `${c.category_name} (+$${(c.spent - c.budgeted).toFixed(2)})`)
                  .join(', ')}
              </div>
            )}

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
                  {movers.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-gray-800">Biggest movers last month:</p>
                      <ul className="space-y-1">
                        {movers.map((m) => (
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
                  {breakdown.map((category) => {
                    const isOver = category.budgeted > 0 && category.spent > category.budgeted;
                    return (
                      <div
                        key={category.category_name}
                        className={`rounded-lg border p-4 ${
                          isOver ? 'border-red-300 bg-red-50/40' : 'border-gray-200'
                        }`}
                      >
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
                          <p className="mt-1 text-right text-xs">
                            <span className={isOver ? 'font-semibold text-red-600' : 'text-gray-500'}>
                              {category.percentage.toFixed(1)}% used
                              {isOver && ` — over by $${(category.spent - category.budgeted).toFixed(2)}`}
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
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
